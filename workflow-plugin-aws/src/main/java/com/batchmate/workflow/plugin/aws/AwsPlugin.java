package com.batchmate.workflow.plugin.aws;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;

import java.util.*;

public class AwsPlugin implements NodeConverterPlugin {

    @Override
    public String pluginId() { return "aws"; }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("s3get",    this::convertS3Get);
        m.put("s3put",    this::convertS3Put);
        m.put("s3delete", this::convertS3Delete);
        m.put("s3list",   this::convertS3List);
        return m;
    }

    private List<Map<String, Object>> convertS3Get(JsonNode data) {
        String bucket    = data.path("bucket").asText("my-bucket");
        String key       = data.path("key").asText("").trim();
        String resultVar = data.path("resultVar").asText("").trim();
        String region    = data.path("region").asText("us-east-1");

        String uri = "aws2-s3://" + bucket
                   + "?region=" + region
                   + "&fileName=" + key;
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("s3get: Reading s3://" + bucket + "/" + key + " [" + region + "]"));
        steps.addAll(ConversionUtils.pollEnrich(uri, resultVar));
        return steps;
    }

    private List<Map<String, Object>> convertS3Put(JsonNode data) {
        String bucket = data.path("bucket").asText("my-bucket");
        String key    = data.path("key").asText("output.txt").trim();
        String region = data.path("region").asText("us-east-1");

        String uri = "aws2-s3://" + bucket
                   + "?region=" + region
                   + "&keyName=" + key;
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("s3put: Writing s3://" + bucket + "/" + key + " [" + region + "]"));
        steps.add(ConversionUtils.toStep(uri, null));
        return steps;
    }

    private List<Map<String, Object>> convertS3Delete(JsonNode data) {
        String bucket = data.path("bucket").asText("my-bucket");
        String key    = data.path("key").asText("").trim();
        String region = data.path("region").asText("us-east-1");

        String uri = "aws2-s3://" + bucket
                   + "?region=" + region
                   + "&deleteAfterRead=true"
                   + "&fileName=" + key;
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("s3delete: Deleting s3://" + bucket + "/" + key + " [" + region + "]"));
        steps.add(ConversionUtils.toStep(uri, null));
        return steps;
    }

    private List<Map<String, Object>> convertS3List(JsonNode data) {
        String bucket    = data.path("bucket").asText("my-bucket");
        String prefix    = data.path("prefix").asText("").trim();
        String region    = data.path("region").asText("us-east-1");
        String resultVar = data.path("resultVar").asText("s3Files").trim();

        String uri = "aws2-s3://" + bucket
                   + "?region=" + region
                   + "&operation=listObjects"
                   + (prefix.isEmpty() ? "" : "&prefix=" + prefix);
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("s3list: Listing s3://" + bucket + (prefix.isEmpty() ? "" : "/" + prefix) + " [" + region + "]"));
        steps.addAll(ConversionUtils.pollEnrich(uri, resultVar));
        return steps;
    }
}
