package com.batchmate.workflow.camel;

import org.apache.camel.CamelContext;
import org.apache.camel.ExtendedCamelContext;
import org.apache.camel.spring.boot.CamelContextConfiguration;
import org.springframework.stereotype.Component;

@Component
public class CamelSetup implements CamelContextConfiguration {

    private final CancellationService cancellationService;

    public CamelSetup(CancellationService cancellationService) {
        this.cancellationService = cancellationService;
    }

    @Override
    public void beforeApplicationStart(CamelContext camelContext) {
        camelContext.adapt(ExtendedCamelContext.class)
            .addInterceptStrategy((ctx, definition, target, nextTarget) -> exchange -> {
                String runId = exchange.getProperty("_runId", String.class);
                if (runId != null && cancellationService.isRequested(runId)) {
                    exchange.setException(new InterruptedException("Cancelled by user"));
                    return;
                }
                target.process(exchange);
            });
    }

    @Override
    public void afterApplicationStart(CamelContext camelContext) {}
}
