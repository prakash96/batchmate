package com.batchmate.workflow.camel.api;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;

@FunctionalInterface
public interface NodeConverter {
    List<Map<String, Object>> convert(JsonNode nodeData);
}
