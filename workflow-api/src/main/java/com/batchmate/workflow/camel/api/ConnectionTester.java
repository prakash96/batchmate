package com.batchmate.workflow.camel.api;

import com.fasterxml.jackson.databind.JsonNode;

@FunctionalInterface
public interface ConnectionTester {
    TestResult test(JsonNode config);
}
