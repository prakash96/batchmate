package com.batchmate.workflow.camel;

import org.apache.camel.spi.CamelEvent;
import org.apache.camel.support.EventNotifierSupport;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Captures per-endpoint execution events for a workflow run.
 *
 * Call startCapture(runId) before invoking the route, then stopCapture(runId)
 * after. Each ExchangeSentEvent (non-direct endpoint call) is recorded with
 * its URI, duration, and success/failure status.
 *
 * Camel Spring Boot auto-discovers this bean as an EventNotifier via its type.
 */
@Component
public class ExecutionCapture extends EventNotifierSupport {

    private final ConcurrentHashMap<String, List<Map<String, Object>>> runCaptures = new ConcurrentHashMap<>();
    private final ThreadLocal<String> activeRunId = new ThreadLocal<>();

    public void startCapture(String runId) {
        runCaptures.put(runId, Collections.synchronizedList(new ArrayList<>()));
        activeRunId.set(runId);
    }

    public List<Map<String, Object>> stopCapture(String runId) {
        activeRunId.remove();
        List<Map<String, Object>> result = runCaptures.remove(runId);
        return result != null ? result : Collections.emptyList();
    }

    @Override
    public void notify(CamelEvent event) throws Exception {
        String runId = activeRunId.get();
        if (runId == null) return;

        List<Map<String, Object>> captures = runCaptures.get(runId);
        if (captures == null) return;

        if (event instanceof CamelEvent.ExchangeSentEvent) {
            CamelEvent.ExchangeSentEvent sent = (CamelEvent.ExchangeSentEvent) event;
            String uri = sent.getEndpoint().getEndpointUri();
            if (uri.startsWith("direct:")) return; // skip internal routing endpoints

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("uri", uri);
            entry.put("durationMs", sent.getTimeTaken());
            boolean failed = sent.getExchange().isFailed();
            entry.put("status", failed ? "failed" : "success");
            Exception ex = sent.getExchange().getException();
            if (ex != null) entry.put("error", ex.getMessage());
            captures.add(entry);
        }
    }

    @Override
    public boolean isEnabled(CamelEvent event) {
        return activeRunId.get() != null && event instanceof CamelEvent.ExchangeSentEvent;
    }
}
