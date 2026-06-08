package com.batchmate.workflow.plugin.gcs;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;

import java.util.*;

public class GcsPlugin implements NodeConverterPlugin {

    @Override
    public String pluginId() { return "gcs"; }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("gcsread",   this::convertGcsRead);
        m.put("gcswrite",  this::convertGcsWrite);
        m.put("gcsdelete", this::convertGcsDelete);
        m.put("gcslist",   this::convertGcsList);
        return m;
    }

    private String buildBaseUri(String bucket, String serviceAccountKeyFile) {
        StringBuilder uri = new StringBuilder("google-storage://").append(bucket);
        if (!serviceAccountKeyFile.isEmpty()) {
            // Normalize to forward slashes and prepend file: so Camel's ResourceHelper
            // doesn't treat the Windows drive letter (e.g. "C:") as a URI scheme.
            String key = serviceAccountKeyFile.replace('\\', '/');
            if (key.length() > 1 && key.charAt(1) == ':') {
                key = "file:" + key;
            }
            uri.append("?serviceAccountKey=").append(key);
        }
        return uri.toString();
    }

    private String appendParam(String uri, String key, String value) {
        char sep = uri.contains("?") ? '&' : '?';
        return uri + sep + key + "=" + value;
    }

    private List<Map<String, Object>> convertGcsRead(JsonNode data) {
        String bucket              = data.path("bucket").asText("my-bucket");
        String objectKey           = data.path("objectKey").asText("").trim();
        String resultVar           = data.path("resultVar").asText("").trim();
        String serviceAccountKey   = data.path("serviceAccountKeyFile").asText("").trim();
        boolean deleteAfterRead    = data.path("deleteAfterRead").asBoolean(false);
        boolean moveAfterRead      = data.path("moveAfterRead").asBoolean(false);
        String destinationBucket   = data.path("destinationBucket").asText("").trim();

        String uri = buildBaseUri(bucket, serviceAccountKey);
        if (!objectKey.isEmpty()) {
            uri = appendParam(uri, "objectName", objectKey);
        }
        if (moveAfterRead && !destinationBucket.isEmpty()) {
            uri = appendParam(uri, "moveAfterRead", "true");
            uri = appendParam(uri, "destinationBucket", destinationBucket);
        } else {
            uri = appendParam(uri, "deleteAfterRead", String.valueOf(deleteAfterRead));
        }

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("gcsread: Reading gs://" + bucket + "/" + objectKey));
        steps.addAll(ConversionUtils.pollEnrich(uri, resultVar));
        // Map CamelGoogleCloudStorageObjectName → fileName (for ${headers.fileName} templates)
        // and → CamelFileName (for the file: component producer to write with the original name).
        steps.add(ConversionUtils.scriptStep("js",
            "var _h=exchange.getMessage();" +
            "var _n=String(_h.getHeader('CamelGoogleCloudStorageObjectName')||'');" +
            "if(_n){_h.setHeader('CamelFileName',_n);_h.setHeader('fileName',_n);}"));
        return steps;
    }

    private List<Map<String, Object>> convertGcsWrite(JsonNode data) {
        String bucket            = data.path("bucket").asText("my-bucket");
        String objectKey         = data.path("objectKey").asText("output.txt").trim();
        String serviceAccountKey = data.path("serviceAccountKeyFile").asText("").trim();
        String contentType       = data.path("contentType").asText("").trim();

        String uri = buildBaseUri(bucket, serviceAccountKey);
        uri = appendParam(uri, "objectName", objectKey);
        if (!contentType.isEmpty()) {
            uri = appendParam(uri, "contentType", contentType);
        }

        boolean dynamic = objectKey.contains("${");
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("gcswrite: Writing gs://" + bucket + "/" + objectKey));
        steps.add(dynamic ? ConversionUtils.toDStep(uri) : ConversionUtils.toStep(uri, null));
        return steps;
    }

    private List<Map<String, Object>> convertGcsDelete(JsonNode data) {
        String bucket            = data.path("bucket").asText("my-bucket");
        String objectKey         = data.path("objectKey").asText("").trim();
        String serviceAccountKey = data.path("serviceAccountKeyFile").asText("").trim();

        String uri = buildBaseUri(bucket, serviceAccountKey);
        uri = appendParam(uri, "operation", "deleteObject");
        uri = appendParam(uri, "objectName", objectKey);

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("gcsdelete: Deleting gs://" + bucket + "/" + objectKey));
        steps.add(ConversionUtils.toStep(uri, null));
        return steps;
    }

    private List<Map<String, Object>> convertGcsList(JsonNode data) {
        String bucket            = data.path("bucket").asText("my-bucket");
        String prefix            = data.path("prefix").asText("").trim();
        String resultVar         = data.path("resultVar").asText("gcsFiles").trim();
        String serviceAccountKey = data.path("serviceAccountKeyFile").asText("").trim();

        String uri = buildBaseUri(bucket, serviceAccountKey);
        uri = appendParam(uri, "operation", "listObjects");
        if (!prefix.isEmpty()) {
            uri = appendParam(uri, "prefix", prefix);
        }

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("gcslist: Listing gs://" + bucket + (prefix.isEmpty() ? "" : "/" + prefix)));
        steps.add(ConversionUtils.toStep(uri, null));
        if (resultVar != null && !resultVar.isEmpty())
            steps.add(ConversionUtils.setVarExpr(resultVar, Map.of("simple", "${body}")));
        return steps;
    }
}
