package com.batchmate.workflow.controller;

import com.batchmate.workflow.dto.*;
import org.apache.camel.CamelContext;
import org.apache.camel.RoutesBuilder;
import org.apache.camel.dsl.yaml.YamlRoutesBuilderLoader;
import org.apache.camel.spi.Resource;
import org.apache.camel.support.ResourceHelper;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/camel")
public class CamelExecutorController {

    private final CamelContext camelContext;

    public CamelExecutorController(CamelContext camelContext) {
        this.camelContext = camelContext;
    }

    @PostMapping("/execute")
    public String execute(@RequestBody RouteRequest request) {

        try {

            Resource resource =
                    ResourceHelper.resolveResource(camelContext, "file:" + request.getYamlPath());

            YamlRoutesBuilderLoader loader =
                    new YamlRoutesBuilderLoader();

            loader.setCamelContext(camelContext);

            RoutesBuilder routesBuilder =
                    loader.loadRoutesBuilder(resource);

            camelContext.addRoutes(routesBuilder);

            return "Route loaded successfully";

        } catch (Exception e) {

            e.printStackTrace();

            return "Failed: " + e.getMessage();
        }
    }
}