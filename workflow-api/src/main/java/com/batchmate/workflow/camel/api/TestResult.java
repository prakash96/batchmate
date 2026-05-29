package com.batchmate.workflow.camel.api;

public class TestResult {
    private final boolean success;
    private final String message;

    public TestResult(boolean success, String message) {
        this.success = success;
        this.message = message;
    }

    public boolean isSuccess() { return success; }
    public String getMessage() { return message; }
}
