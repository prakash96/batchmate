package com.batchmate.apitester.service;

import org.apache.camel.CamelContext;
import org.apache.camel.RoutesBuilder;
import org.apache.camel.dsl.yaml.YamlRoutesBuilderLoader;
import org.apache.camel.spi.Resource;
import org.apache.camel.support.ResourceHelper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Deploys a generated Camel YAML route file into the running CamelContext, removing
 * any previously-deployed route(s) for the same request id first. Copied/trimmed from
 * workflow-app's CamelRouteDeployService (no split-pool registration needed here —
 * requests are a flat step list, never a "split" EIP).
 */
@Service
public class CamelRouteDeployService {

    private static final Logger log = LoggerFactory.getLogger(CamelRouteDeployService.class);

    private final CamelContext camelContext;

    public CamelRouteDeployService(CamelContext camelContext) {
        this.camelContext = camelContext;
    }

    public void deploy(String requestId, Path yamlFile) throws Exception {
        removeExistingRoutes(requestId);

        Resource resource = ResourceHelper.resolveResource(
                camelContext, "file:" + yamlFile.toAbsolutePath());

        YamlRoutesBuilderLoader loader = new YamlRoutesBuilderLoader();
        loader.setCamelContext(camelContext);
        RoutesBuilder routesBuilder = loader.loadRoutesBuilder(resource);

        camelContext.addRoutes(routesBuilder);
        log.info("Deployed Camel route for request: {}", requestId);
    }

    private void removeExistingRoutes(String requestId) {
        List<String> existing = camelContext.getRoutes().stream()
                .map(r -> r.getRouteId())
                .filter(id -> id != null && id.equals(requestId))
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
