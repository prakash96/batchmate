package com.batchmate.workflow.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public final class PathResolver {

    private static final Logger log = LoggerFactory.getLogger(PathResolver.class);

    private PathResolver() {}

    /**
     * Resolves a directory using this priority:
     * 1. Configured path if it already exists (handles absolute paths)
     * 2. Next to the JAR / class root (the "same folder as the JAR" case)
     * 3. Ancestor walk from CWD (IDE / Maven dev mode)
     * 4. Fallback: return a path next to the JAR so new directories are created there
     */
    public static Path resolveDir(String configured, String folderName) {
        // 1. Configured path exists as-is (absolute, or already correct relative path)
        Path candidate = Paths.get(configured).toAbsolutePath().normalize();
        if (Files.isDirectory(candidate)) return candidate;

        // 2. Look next to the JAR (or class root in dev)
        Path jarDir = getJarDir();
        if (jarDir != null) {
            candidate = jarDir.resolve(folderName).normalize();
            if (Files.isDirectory(candidate)) return candidate;
        }

        // 3. Walk up ancestor chain from CWD (IDE / mvn spring-boot:run)
        Path cwd = Paths.get(System.getProperty("user.dir")).toAbsolutePath().normalize();
        log.debug("'{}' not found; searching ancestors of CWD: {}", folderName, cwd);
        Path ancestor = cwd;
        for (int i = 0; i < 5; i++) {
            candidate = ancestor.resolve(folderName).normalize();
            if (Files.isDirectory(candidate)) return candidate;
            if (ancestor.getParent() == null) break;
            ancestor = ancestor.getParent();
        }

        // 4. Not found anywhere — return next to JAR so the app creates it there
        Path fallback = jarDir != null
                ? jarDir.resolve(folderName).normalize()
                : cwd.resolve(folderName).normalize();
        log.warn("Could not locate '{}'; will use {}", folderName, fallback);
        return fallback;
    }

    private static Path getJarDir() {
        try {
            URI uri = PathResolver.class.getProtectionDomain().getCodeSource().getLocation().toURI();
            // Spring Boot fat JARs expose a "jar:file:/path/to/app.jar!/BOOT-INF/classes/" URI.
            // Paths.get() rejects the "jar:" scheme — unwrap it to the outer file URI.
            if ("jar".equals(uri.getScheme())) {
                String spec = uri.getSchemeSpecificPart(); // "file:/path/to/app.jar!/..."
                int bang = spec.indexOf("!/");
                uri = new URI(bang >= 0 ? spec.substring(0, bang) : spec);
            }
            Path location = Paths.get(uri);
            return Files.isDirectory(location) ? location : location.getParent();
        } catch (URISyntaxException | SecurityException e) {
            log.debug("Could not determine JAR location: {}", e.getMessage());
            return null;
        }
    }
}
