package com.batchmate.workflow.service;

import org.apache.camel.CamelContext;
import org.apache.camel.RoutesBuilder;
import org.apache.camel.dsl.yaml.YamlRoutesBuilderLoader;
import org.apache.camel.spi.Resource;
import org.apache.camel.support.ResourceHelper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class CamelRouteDeployService {

    private static final Logger log = LoggerFactory.getLogger(CamelRouteDeployService.class);
    private static final Pattern SPLIT_POOL_PATTERN = Pattern.compile("executorService:\\s*[\"']splitPool-(\\d+)[\"']");

    private final CamelContext camelContext;
    private final ConfigurableApplicationContext appContext;

    public CamelRouteDeployService(CamelContext camelContext, ConfigurableApplicationContext appContext) {
        this.camelContext = camelContext;
        this.appContext = appContext;
    }

    public void deploy(String workflowId, Path yamlFile) throws Exception {
        removeExistingRoutes(workflowId);
        registerSplitPools(yamlFile);

        Resource resource = ResourceHelper.resolveResource(
                camelContext, "file:" + yamlFile.toAbsolutePath());

        YamlRoutesBuilderLoader loader = new YamlRoutesBuilderLoader();
        loader.setCamelContext(camelContext);
        RoutesBuilder routesBuilder = loader.loadRoutesBuilder(resource);

        camelContext.addRoutes(routesBuilder);
        log.info("Deployed Camel routes for workflow: {}", workflowId);
    }

    private void registerSplitPools(Path yamlFile) throws Exception {
        String content = Files.readString(yamlFile);
        Matcher m = SPLIT_POOL_PATTERN.matcher(content);
        while (m.find()) {
            int n = Integer.parseInt(m.group(1));
            String beanName = "splitPool-" + n;
            if (!appContext.containsBean(beanName)) {
                java.util.concurrent.ExecutorService pool = Executors.newFixedThreadPool(n);
                appContext.getBeanFactory().registerSingleton(beanName, pool);
                log.info("Registered split thread pool: {} ({} threads)", beanName, n);
            }
        }
    }

    private void removeExistingRoutes(String workflowId) {
        List<String> existing = camelContext.getRoutes().stream()
                .map(r -> r.getRouteId())
                .filter(id -> id != null && id.startsWith(workflowId + "-"))
                .collect(Collectors.toList());

        for (String routeId : existing) {
            try {
                camelContext.getRouteController().stopRoute(routeId);
                camelContext.removeRoute(routeId);
                log.info("Removed route: {}", routeId);
            } catch (Exception e) {
                log.warn("Could not remove route {}: {}", routeId, e.getMessage());
            }
        }
    }
}
