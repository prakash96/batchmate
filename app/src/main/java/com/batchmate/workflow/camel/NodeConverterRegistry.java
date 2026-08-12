package com.batchmate.workflow.camel;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.workflow.camel.api.ConnectionTester;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;
import com.batchmate.workflow.camel.api.TestResult;
import com.batchmate.workflow.service.ConnectionService;
import com.batchmate.workflow.service.VaultService;
import com.batchmate.workflow.util.PathResolver;
import org.apache.camel.CamelContext;
import org.apache.camel.Component;
import org.apache.camel.support.DefaultComponent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.ServiceLoader;
import java.util.stream.Stream;
import java.util.zip.ZipFile;

@Service
public class NodeConverterRegistry {

    private static final Logger log = LoggerFactory.getLogger(NodeConverterRegistry.class);

    private final Map<String, NodeConverter>    converters        = new LinkedHashMap<>();
    private final Map<String, ConnectionTester> connectionTesters = new LinkedHashMap<>();
    private final List<String> pluginStatus = new ArrayList<>();
    private final List<URL>    pluginUrls   = new ArrayList<>();
    private final CamelContext camelContext;
    private final VaultService vaultService;
    private final ConnectionService connectionService;

    @Value("${plugins.dir:../plugins}")
    private String pluginsDir;

    public NodeConverterRegistry(CamelContext camelContext, VaultService vaultService, ConnectionService connectionService) {
        this.camelContext = camelContext;
        this.vaultService = vaultService;
        this.connectionService = connectionService;
    }

    @PostConstruct
    public void loadPlugins() {
        fixSslTrustAnchors();
        camelContext.getPropertiesComponent()
            .addPropertiesSource(new ConnectionPropertiesSource(connectionService));
        camelContext.getPropertiesComponent()
            .addPropertiesSource(new VaultPropertiesSource(vaultService));

        Path dir = PathResolver.resolveDir(pluginsDir, "plugins");
        if (!Files.exists(dir)) {
            String msg = "WARN  Plugins directory not found: " + dir.toAbsolutePath() + " — no node types will be available";
            log.warn(msg);
            pluginStatus.add(msg);
            return;
        }
        pluginStatus.add("INFO  Plugins directory: " + dir.toAbsolutePath());
        log.info("Loading plugins from: {}", dir.toAbsolutePath());
        try (Stream<Path> entries = Files.list(dir)) {
            entries.filter(p -> p.getFileName().toString().endsWith(".jar"))
                   .sorted()
                   .forEach(this::loadJar);
        } catch (IOException e) {
            log.error("Failed to scan plugins directory: {}", e.getMessage());
            pluginStatus.add("ERROR Failed to scan plugins directory: " + e.getMessage());
        }
        pluginStatus.add("INFO  Total node types registered: " + converters.size()
                + " [" + String.join(", ", converters.keySet()) + "]");

        // Extend CamelContext's application ClassLoader with all plugin JAR URLs so that
        // Camel's DefaultPropertyConfigurerResolver can load endpoint configurers (e.g.
        // GoogleCloudStorageEndpointConfigurer) that live in plugin classloaders.
        // Camel resolves configurers lazily at route-deployment time, so this update
        // in @PostConstruct is always in time.
        if (!pluginUrls.isEmpty()) {
            ClassLoader parent = camelContext.getApplicationContextClassLoader();
            if (parent == null) parent = getClass().getClassLoader();
            URLClassLoader extended = new URLClassLoader(pluginUrls.toArray(new URL[0]), parent);
            camelContext.setApplicationContextClassLoader(extended);
            log.info("Extended CamelContext ClassLoader with {} plugin JAR(s)", pluginUrls.size());
        }
    }

    private void loadJar(Path jar) {
        try {
            URL jarUrl = jar.toUri().toURL();
            pluginUrls.add(jarUrl);
            URLClassLoader cl = new URLClassLoader(
                    new URL[]{ jarUrl },
                    getClass().getClassLoader());

            registerCamelComponents(jar, cl);
            registerJdbcDrivers(jar, cl);

            int loaded = 0;
            for (NodeConverterPlugin plugin : ServiceLoader.load(NodeConverterPlugin.class, cl)) {
                Map<String, NodeConverter> provided = plugin.converters();
                provided.forEach((type, converter) -> converters.put(type, converter));
                plugin.connectionTesters().forEach(connectionTesters::put);
                plugin.beans().forEach((name, bean) -> {
                    try {
                        camelContext.getRegistry().bind(name, bean);
                        log.info("Registered bean '{}' from plugin '{}'", name, plugin.pluginId());
                    } catch (Exception e) {
                        log.warn("Could not register bean '{}' from plugin '{}': {}", name, plugin.pluginId(), e.getMessage());
                    }
                });
                String msg = "INFO  Plugin '" + plugin.pluginId() + "' → "
                        + provided.size() + " type(s): " + String.join(", ", provided.keySet())
                        + "  [" + jar.getFileName() + "]";
                log.info("Plugin '{}' loaded {} type(s) from {}", plugin.pluginId(), provided.size(), jar.getFileName());
                pluginStatus.add(msg);
                loaded++;
            }
            if (loaded == 0) {
                String msg = "WARN  No plugin found in " + jar.getFileName() + " — missing META-INF/services?";
                log.warn(msg);
                pluginStatus.add(msg);
            }
        } catch (Exception e) {
            String msg = "ERROR Failed to load " + jar.getFileName() + ": " + e.getMessage();
            log.error(msg);
            pluginStatus.add(msg);
        }
    }

    /**
     * On Windows JDKs, the cacerts file may ship empty — detect this at startup and
     * fall back to the Windows system certificate store so HTTPS requests work out of the box.
     */
    private static void fixSslTrustAnchors() {
        if (!System.getProperty("os.name", "").toLowerCase().contains("win")) return;
        if (System.getProperty("javax.net.ssl.trustStore") != null
                || System.getProperty("javax.net.ssl.trustStoreType") != null) return;
        try {
            javax.net.ssl.TrustManagerFactory tmf = javax.net.ssl.TrustManagerFactory
                .getInstance(javax.net.ssl.TrustManagerFactory.getDefaultAlgorithm());
            tmf.init((java.security.KeyStore) null);
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg != null && msg.contains("trustAnchors")) {
                System.setProperty("javax.net.ssl.trustStoreType", "Windows-ROOT");
                log.info("Empty JVM trust store detected — switched SSL trust store to Windows-ROOT");
            }
        }
    }

    private static final String CAMEL_COMPONENT_PREFIX  = "META-INF/services/org/apache/camel/component/";
    private static final String CAMEL_CONFIGURER_PREFIX = "META-INF/services/org/apache/camel/configurer/";

    @SuppressWarnings("unchecked")
    private void registerCamelComponents(Path jar, URLClassLoader cl) {
        try (ZipFile zf = new ZipFile(jar.toFile())) {
            zf.stream()
              .filter(e -> !e.isDirectory()
                        && e.getName().startsWith(CAMEL_COMPONENT_PREFIX)
                        && !e.getName().substring(CAMEL_COMPONENT_PREFIX.length()).contains("/"))
              .forEach(entry -> {
                  String scheme = entry.getName().substring(CAMEL_COMPONENT_PREFIX.length());
                  try (InputStream is = zf.getInputStream(entry)) {
                      Properties props = new Properties();
                      props.load(is);
                      String className = props.getProperty("class");
                      if (className == null) return;
                      Class<? extends Component> compClass =
                          (Class<? extends Component>) cl.loadClass(className);
                      Component comp = compClass.getDeclaredConstructor().newInstance();
                      // Inject configurers directly into DefaultComponent's private fields BEFORE
                      // addComponent() triggers doBuild(). doBuild() skips resolvePropertyConfigurer()
                      // when the fields are already non-null (bytecode: ifnonnull → skip resolver).
                      // Using cl (same classloader as comp) avoids ClassCastException inside the
                      // configurer when it casts the endpoint object back to its plugin-loaded type.
                      injectConfigurerField(zf, cl, comp, "endpointPropertyConfigurer",  scheme + "-endpoint");
                      injectConfigurerField(zf, cl, comp, "componentPropertyConfigurer", scheme + "-component");
                      configureComponent(scheme, comp, cl);
                      camelContext.addComponent(scheme, comp);
                      log.info("Registered Camel component '{}' from plugin: {}", scheme, jar.getFileName());
                      pluginStatus.add("INFO  Camel component '" + scheme + "' registered from " + jar.getFileName());
                  } catch (Exception e) {
                      log.debug("Could not register component '{}' from {}: {}", scheme, jar.getFileName(), e.getMessage());
                  }
              });
        } catch (IOException e) {
            log.debug("Could not scan {} for Camel components: {}", jar.getFileName(), e.getMessage());
        }
    }

    private void injectConfigurerField(ZipFile zf, URLClassLoader cl, Component comp, String fieldName, String configurerKey) {
        java.util.zip.ZipEntry entry = zf.getEntry(CAMEL_CONFIGURER_PREFIX + configurerKey);
        if (entry == null) return;
        try (InputStream is = zf.getInputStream(entry)) {
            Properties props = new Properties();
            props.load(is);
            String className = props.getProperty("class");
            if (className == null) return;
            Object configurer = cl.loadClass(className).getDeclaredConstructor().newInstance();
            java.lang.reflect.Field field = DefaultComponent.class.getDeclaredField(fieldName);
            field.setAccessible(true);
            field.set(comp, configurer);
            log.debug("Injected configurer '{}' into {} field '{}'", configurerKey, comp.getClass().getSimpleName(), fieldName);
        } catch (Exception e) {
            log.warn("Could not inject configurer '{}' into '{}': {}", configurerKey, fieldName, e.getMessage());
        }
    }

    /**
     * Post-instantiation configuration for specific component types.
     * Uses reflection so the app module has no compile-time dependency on plugin classes.
     */
    private void configureComponent(String scheme, Component comp, URLClassLoader cl) {
        if ("sftp".equals(scheme)) {
            try {
                // Set global JSch static config via the plugin classloader — this covers both
                // SftpHelper (direct JSch sessions) and the Camel SFTP component (which uses
                // the same JSch class from the same classloader).
                Class<?> jschClass = cl.loadClass("com.jcraft.jsch.JSch");
                java.lang.reflect.Method setConfig = jschClass.getMethod("setConfig", String.class, String.class);
                setConfig.invoke(null, "GSSAPIAuthentication", "no");
                setConfig.invoke(null, "PreferredAuthentications", "publickey,keyboard-interactive,password");
                log.info("Configured JSch to disable Kerberos/GSSAPI for SFTP");
            } catch (Exception e) {
                log.warn("Could not configure JSch for SFTP: {}", e.getMessage());
            }
        }
        if ("ftp".equals(scheme) || "ftps".equals(scheme)) {
            try {
                java.lang.reflect.Method getConf = comp.getClass().getMethod("getConfiguration");
                Object conf = getConf.invoke(comp);
                java.lang.reflect.Method setPassive = conf.getClass().getMethod("setPassiveMode", boolean.class);
                setPassive.invoke(conf, true);
                log.debug("Configured passive mode for {} component", scheme);
            } catch (Exception e) {
                log.debug("Could not configure passive mode for {} component: {}", scheme, e.getMessage());
            }
        }
        if ("http".equals(scheme) || "https".equals(scheme)) {
            installTrustAllSsl(scheme, comp, cl);
        }
    }

    // Sets a trust-all HttpClientConfigurer on the HttpComponent so every endpoint it creates
    // skips SSL certificate validation. Uses a Proxy loaded in the plugin ClassLoader to avoid
    // ClassCastException when the component casts the configurer back to its own loaded type.
    private void installTrustAllSsl(String scheme, Component comp, URLClassLoader cl) {
        try {
            javax.net.ssl.SSLContext ctx = javax.net.ssl.SSLContext.getInstance("TLS");
            ctx.init(null, new javax.net.ssl.TrustManager[]{
                new javax.net.ssl.X509TrustManager() {
                    public java.security.cert.X509Certificate[] getAcceptedIssuers() { return new java.security.cert.X509Certificate[0]; }
                    public void checkClientTrusted(java.security.cert.X509Certificate[] c, String a) {}
                    public void checkServerTrusted(java.security.cert.X509Certificate[] c, String a) {}
                }
            }, new java.security.SecureRandom());

            Class<?> ifaceClass = cl.loadClass("org.apache.camel.component.http.HttpClientConfigurer");
            Object configurer = java.lang.reflect.Proxy.newProxyInstance(cl, new Class[]{ifaceClass},
                (proxy, method, args) -> {
                    if ("configureHttpClient".equals(method.getName()) && args != null && args.length == 1) {
                        Object builder = args[0];
                        builder.getClass().getMethod("setSSLContext", javax.net.ssl.SSLContext.class).invoke(builder, ctx);
                        builder.getClass().getMethod("setSSLHostnameVerifier", javax.net.ssl.HostnameVerifier.class)
                               .invoke(builder, (javax.net.ssl.HostnameVerifier) (h, s) -> true);
                    }
                    return null;
                });

            comp.getClass().getMethod("setHttpClientConfigurer", ifaceClass).invoke(comp, configurer);
            log.info("Installed trust-all SSL configurer for '{}' component", scheme);
        } catch (Exception e) {
            log.warn("Could not install trust-all SSL for '{}': {}", scheme, e.getMessage());
        }
    }

    private void registerJdbcDrivers(Path jar, URLClassLoader cl) {
        try {
            for (java.sql.Driver driver : ServiceLoader.load(java.sql.Driver.class, cl)) {
                try {
                    java.sql.DriverManager.registerDriver(new DriverShim(driver));
                    String name = driver.getClass().getName();
                    log.info("Registered JDBC driver '{}' from {}", name, jar.getFileName());
                    pluginStatus.add("INFO  JDBC driver '" + name + "' registered from " + jar.getFileName());
                } catch (java.sql.SQLException e) {
                    log.warn("Could not register JDBC driver from {}: {}", jar.getFileName(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.debug("No JDBC drivers in {}: {}", jar.getFileName(), e.getMessage());
        }
    }

    /** Returns the plugin loading summary lines to be logged at run start. */
    public List<String> getPluginStatus() {
        return Collections.unmodifiableList(pluginStatus);
    }

    public List<Map<String, Object>> convert(String type, JsonNode data) {
        NodeConverter c = converters.get(type);
        if (c == null) return Collections.singletonList(ConversionUtils.logMsg("[TODO] Unsupported: " + type));
        return c.convert(resolveVaultRefs(resolveConnectionRef(data)));
    }

    /**
     * When node data contains a connectionId, looks up the saved connection and merges its
     * config fields (host, port, username, password, etc.) into the node data so plugins
     * can read connection fields directly without needing to resolve the reference themselves.
     * Connection config fields always take precedence over any defaults already in node data.
     */
    private static final java.util.Set<String> SENSITIVE_FIELDS = java.util.Set.of(
        "password", "privateKeyPassphrase", "passphrase", "secret", "apiSecret", "apiKey"
    );

    private JsonNode resolveConnectionRef(JsonNode data) {
        if (!data.isObject()) return data;
        String connectionId = data.path("connectionId").asText("");
        if (connectionId.isEmpty()) return data;
        try {
            JsonNode conn = connectionService.list().stream()
                .filter(c -> connectionId.equals(c.path("id").asText()))
                .findFirst().orElse(null);
            if (conn == null) {
                log.warn("Connection '{}' not found — using node data as-is", connectionId);
                return data;
            }
            JsonNode config = conn.path("config");
            if (!config.isObject()) return data;
            ObjectNode merged = data.deepCopy();
            config.fields().forEachRemaining(e -> {
                String key = e.getKey();
                if (SENSITIVE_FIELDS.contains(key)) {
                    // Store a property placeholder — actual value resolved at runtime by ConnectionPropertiesSource
                    merged.put(key, "{{conn." + connectionId + "." + key + "}}");
                } else {
                    merged.set(key, e.getValue());
                }
            });
            return merged;
        } catch (Exception e) {
            log.warn("Could not resolve connection ref '{}': {}", connectionId, e.getMessage());
            return data;
        }
    }

    /**
     * For each *Source field whose value is "vault", looks up the corresponding *Vault entry ID,
     * fetches keyContent from the vault, then rewrites the node data with source="inline" and
     * the resolved key content in the *Inline field so plugins don't need vault awareness.
     */
    private JsonNode resolveVaultRefs(JsonNode data) {
        if (!data.isObject()) return data;
        List<JsonNode> entries;
        try {
            entries = vaultService.list();
        } catch (Exception e) {
            log.warn("Could not load vault entries for ref resolution: {}", e.getMessage());
            return data;
        }
        ObjectNode copy = null;
        for (java.util.Iterator<Map.Entry<String, JsonNode>> it = data.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> field = it.next();
            String key = field.getKey();
            if (!key.endsWith("Source") || !"vault".equals(field.getValue().asText())) continue;
            String prefix      = key.substring(0, key.length() - "Source".length());
            String vaultIdField = prefix + "Vault";
            String inlineField  = prefix + "Inline";
            String vaultId = data.path(vaultIdField).asText("");
            if (vaultId.isEmpty()) continue;
            String content = entries.stream()
                .filter(e -> vaultId.equals(e.path("id").asText()))
                .findFirst()
                .map(e -> e.path("config").path("keyContent").asText(null))
                .orElse(null);
            if (content == null) {
                log.warn("Vault entry '{}' not found or has no keyContent", vaultId);
                continue;
            }
            if (copy == null) copy = data.deepCopy();
            copy.put(key, "inline");
            copy.put(inlineField, content);
        }
        return copy != null ? copy : data;
    }

    public TestResult testConnection(String type, JsonNode config) {
        ConnectionTester tester = connectionTesters.get(type);
        if (tester == null) return new TestResult(false, "No tester registered for connection type: " + type);
        return tester.test(config);
    }
}
