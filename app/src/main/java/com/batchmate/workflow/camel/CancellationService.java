package com.batchmate.workflow.camel;

import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class CancellationService {

    private final Set<String> pending = ConcurrentHashMap.newKeySet();

    public void request(String runId) { pending.add(runId); }
    public void clear(String runId)   { pending.remove(runId); }
    public boolean isRequested(String runId) { return pending.contains(runId); }
}
