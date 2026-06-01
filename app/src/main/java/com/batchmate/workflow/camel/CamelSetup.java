package com.batchmate.workflow.camel;

import org.apache.camel.AsyncCallback;
import org.apache.camel.AsyncProcessor;
import org.apache.camel.CamelContext;
import org.apache.camel.Exchange;
import org.apache.camel.ExtendedCamelContext;
import org.apache.camel.spring.boot.CamelContextConfiguration;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

@Component
public class CamelSetup implements CamelContextConfiguration {

    private final CancellationService cancellationService;

    public CamelSetup(CancellationService cancellationService) {
        this.cancellationService = cancellationService;
    }

    @Override
    public void beforeApplicationStart(CamelContext camelContext) {
        camelContext.adapt(ExtendedCamelContext.class)
            .addInterceptStrategy((ctx, definition, target, nextTarget) -> new AsyncProcessor() {

                @Override
                public boolean process(Exchange exchange, AsyncCallback callback) {
                    String runId = exchange.getProperty("_runId", String.class);
                    if (runId != null && cancellationService.isRequested(runId)) {
                        exchange.setException(new InterruptedException("Cancelled by user"));
                        callback.done(true);
                        return true;
                    }
                    if (target instanceof AsyncProcessor) {
                        return ((AsyncProcessor) target).process(exchange, callback);
                    }
                    try {
                        target.process(exchange);
                    } catch (Exception e) {
                        exchange.setException(e);
                    }
                    callback.done(true);
                    return true;
                }

                @Override
                public CompletableFuture<Exchange> processAsync(Exchange exchange) {
                    CompletableFuture<Exchange> future = new CompletableFuture<>();
                    process(exchange, done -> future.complete(exchange));
                    return future;
                }

                @Override
                public void process(Exchange exchange) throws Exception {
                    String runId = exchange.getProperty("_runId", String.class);
                    if (runId != null && cancellationService.isRequested(runId)) {
                        exchange.setException(new InterruptedException("Cancelled by user"));
                        return;
                    }
                    target.process(exchange);
                }
            });
    }

    @Override
    public void afterApplicationStart(CamelContext camelContext) {}
}
