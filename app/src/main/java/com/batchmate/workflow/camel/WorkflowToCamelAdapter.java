package com.batchmate.workflow.camel;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConversionUtils;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

/**
 * Converts a saved workflow JSON (as produced by the flow-builder) into
 * Apache Camel YAML DSL.
 *
 * One Camel route is emitted per non-empty workflow section:
 *   processing       → direct:<workflowId>
 *   processingFailed → direct:<workflowId>-processingFailed
 *   validation       → direct:<workflowId>-validation
 *   verifyFailed     → direct:<workflowId>-verifyFailed
 *
 * Structural nodes (workflowcontainer, section, errorscope) are skipped.
 * Iteration nodes map to Camel's split EIP; condition nodes map to choice.
 */
@Service
public class WorkflowToCamelAdapter {

    private final NodeConverterRegistry registry;

    public WorkflowToCamelAdapter(NodeConverterRegistry registry) {
        this.registry = registry;
    }

    private static final Set<String> SKIP_TYPES =
        Set.of("section", "workflowcontainer", "errorscope");

    private static final List<String> SECTION_ORDER =
        List.of("processing", "processingFailed");

    // ── Public API ────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public String convert(JsonNode workflowJson) {
        String id   = workflowJson.path("id").asText("workflow");
        String name = workflowJson.path("name").asText("Unnamed workflow");

        JsonNode wf       = workflowJson.path("workflow");
        List<JsonNode> allNodes = toList(wf.path("nodes"));
        List<JsonNode> allEdges = toList(wf.path("edges"));

        // Resolve error variable prefix from the errorscope node (default "error")
        String errorVarPrefix = allNodes.stream()
            .filter(n -> "errorscope".equals(n.path("type").asText()))
            .map(n -> {
                String p = n.path("data").path("errorVarPrefix").asText("").trim();
                return p.isEmpty() ? "error" : p;
            })
            .findFirst().orElse("error");

        // Only executable nodes (have a section annotation from annotateNodesWithSection)
        List<JsonNode> execNodes = allNodes.stream()
            .filter(n -> !SKIP_TYPES.contains(n.path("type").asText()))
            .collect(Collectors.toList());

        // Group top-level section nodes (not inside an iteration container)
        Set<String> iterationIds = execNodes.stream()
            .filter(n -> "iteration".equals(n.path("type").asText()))
            .map(n -> n.path("id").asText())
            .collect(Collectors.toSet());

        Map<String, List<JsonNode>> bySection = new LinkedHashMap<>();
        for (String sec : SECTION_ORDER) bySection.put(sec, new ArrayList<>());

        for (JsonNode n : execNodes) {
            String parentId = n.path("parentId").asText(null);
            if (parentId != null && iterationIds.contains(parentId)) continue; // child of iteration — handled inline
            String sec = n.path("section").asText(null);
            if (sec != null && bySection.containsKey(sec)) bySection.get(sec).add(n);
        }

        boolean hasErrorHandler = !bySection.getOrDefault("processingFailed", Collections.emptyList()).isEmpty();

        List<Object> routes = new ArrayList<>();
        for (Map.Entry<String, List<JsonNode>> entry : bySection.entrySet()) {
            String section       = entry.getKey();
            List<JsonNode> nodes = entry.getValue();
            if (nodes.isEmpty()) continue;

            String routeId = id + "-" + section;
            String fromUri = "direct:" + id + ("processing".equals(section) ? "" : "-" + section);

            Map<String, Object> route = buildRoute(routeId, fromUri, nodes, allNodes, allEdges);

            // Wrap processing steps in doTry/doCatch to invoke the error handler on any exception
            if ("processing".equals(section) && hasErrorHandler) {
                List<Map<String, Object>> innerSteps =
                    (List<Map<String, Object>>) route.get("steps");

                List<Map<String, Object>> catchSteps = new ArrayList<>();
                catchSteps.add(ConversionUtils.setVarExpr(errorVarPrefix + "Message",
                    Map.of("simple", "${exception.message}")));
                catchSteps.add(ConversionUtils.setVarExpr(errorVarPrefix + "Type",
                    Map.of("simple", "${exception.class.name}")));
                catchSteps.add(ConversionUtils.setVarExpr(errorVarPrefix + "StackTrace",
                    Map.of("simple", "${exception.stacktrace}")));
                catchSteps.add(ConversionUtils.setVarExpr(errorVarPrefix + "Code",
                    Map.of("simple", "${exchangeProperty._errorCode}")));
                catchSteps.add(ConversionUtils.toStep("direct:" + id + "-processingFailed", null));

                Map<String, Object> catchClause = new LinkedHashMap<>();
                catchClause.put("exception", List.of("java.lang.Exception"));
                catchClause.put("steps", catchSteps);

                Map<String, Object> doTryBody = new LinkedHashMap<>();
                doTryBody.put("steps", innerSteps);
                doTryBody.put("doCatch", List.of(catchClause));

                Map<String, Object> doTryStep = new LinkedHashMap<>();
                doTryStep.put("doTry", doTryBody);

                route.put("steps", List.of(doTryStep));
            }

            Map<String, Object> wrapper = new LinkedHashMap<>();
            wrapper.put("route", route);
            routes.add(wrapper);
        }

        return "# Camel YAML DSL — generated from workflow: " + name + "\n"
             + "# ID: " + id + "\n\n"
             + dumpYaml(routes);
    }

    // ── Route builder ─────────────────────────────────────────────────────────

    private Map<String, Object> buildRoute(String routeId, String fromUri,
                                            List<JsonNode> sectionTopNodes,
                                            List<JsonNode> allNodes,
                                            List<JsonNode> allEdges) {
        Set<String> scopeIds = sectionTopNodes.stream()
            .map(n -> n.path("id").asText())
            .collect(Collectors.toSet());

        // Start node = has no incoming edge from within the same scope
        Set<String> targets = allEdges.stream()
            .filter(e -> scopeIds.contains(e.path("source").asText()))
            .map(e -> e.path("target").asText())
            .collect(Collectors.toSet());

        Optional<JsonNode> start = sectionTopNodes.stream()
            .filter(n -> !targets.contains(n.path("id").asText()))
            .findFirst();

        Map<String, Object> from = new LinkedHashMap<>();
        from.put("uri", fromUri);

        List<Map<String, Object>> steps = new ArrayList<>();
        start.ifPresent(s ->
            buildSteps(s.path("id").asText(), allNodes, allEdges, scopeIds, new HashSet<>(), steps));

        Map<String, Object> route = new LinkedHashMap<>();
        route.put("id", routeId);
        route.put("from", from);
        route.put("steps", steps);
        return route;
    }

    // ── Graph walker ──────────────────────────────────────────────────────────

    private void buildSteps(String nodeId,
                             List<JsonNode> allNodes,
                             List<JsonNode> allEdges,
                             Set<String> scopeIds,
                             Set<String> visited,
                             List<Map<String, Object>> out) {
        if (nodeId == null || visited.contains(nodeId) || !scopeIds.contains(nodeId)) return;
        visited.add(nodeId);

        JsonNode node = findNode(allNodes, nodeId);
        if (node == null) return;

        String type = node.path("type").asText();
        JsonNode data = node.path("data");

        switch (type) {

            case "condition": {
                JsonNode trueEdge  = edgeByHandle(allEdges, nodeId, "true");
                JsonNode falseEdge = edgeByHandle(allEdges, nodeId, "false");
                String trueTo  = trueEdge  != null ? trueEdge.path("target").asText(null)  : null;
                String falseTo = falseEdge != null ? falseEdge.path("target").asText(null) : null;

                // when clause
                Map<String, Object> whenItem = new LinkedHashMap<>();
                whenItem.put("expression",
                    Map.of("js", ConversionUtils.buildConditionJs(data)));
                List<Map<String, Object>> trueSteps = new ArrayList<>();
                if (trueTo != null)
                    buildSteps(trueTo, allNodes, allEdges, scopeIds, new HashSet<>(visited), trueSteps);
                whenItem.put("steps", trueSteps);

                // otherwise clause
                List<Map<String, Object>> falseSteps = new ArrayList<>();
                if (falseTo != null)
                    buildSteps(falseTo, allNodes, allEdges, scopeIds, new HashSet<>(visited), falseSteps);
                Map<String, Object> otherwise = new LinkedHashMap<>();
                otherwise.put("steps", falseSteps);

                Map<String, Object> choiceBody = new LinkedHashMap<>();
                choiceBody.put("when", List.of(whenItem));
                choiceBody.put("otherwise", otherwise);

                Map<String, Object> choiceStep = new LinkedHashMap<>();
                choiceStep.put("choice", choiceBody);
                out.add(choiceStep);

                // Continue from merge point (first node reachable from both branches)
                String mergeId = findMergePoint(trueTo, falseTo, allNodes, allEdges, scopeIds, visited);
                if (mergeId != null)
                    buildSteps(mergeId, allNodes, allEdges, scopeIds, visited, out);
                break;
            }

            case "iteration": {
                // Collect child nodes (parentId = this iteration node)
                List<JsonNode> children = allNodes.stream()
                    .filter(n -> nodeId.equals(n.path("parentId").asText())
                              && !SKIP_TYPES.contains(n.path("type").asText()))
                    .collect(Collectors.toList());

                Set<String> childIds = children.stream()
                    .map(n -> n.path("id").asText())
                    .collect(Collectors.toSet());

                Set<String> childTargets = allEdges.stream()
                    .filter(e -> childIds.contains(e.path("source").asText()))
                    .map(e -> e.path("target").asText())
                    .collect(Collectors.toSet());

                Optional<JsonNode> childStart = children.stream()
                    .filter(n -> !childTargets.contains(n.path("id").asText()))
                    .findFirst();

                // Determine split expression from the "collection" field set in the UI
                String collection   = data.path("collection").asText("").trim();
                String placeholder  = data.path("placeholder").asText("").trim();

                Map<String, Object> splitExpr;
                if (collection.isEmpty()) {
                    splitExpr = Map.of("simple", "${body}");           // default: iterate over body
                } else if (collection.startsWith("$")) {
                    splitExpr = Map.of("jsonpath", collection);        // JSONPath expression
                } else if (collection.contains("${")) {
                    splitExpr = Map.of("simple", collection);          // Simple expression
                } else {
                    splitExpr = Map.of("js", collection);              // JavaScript expression (verbatim)
                }

                List<Map<String, Object>> childSteps = new ArrayList<>();
                // If placeholder is named, store the current item in an exchange property
                if (!placeholder.isEmpty()) {
                    Map<String, Object> setProp = new LinkedHashMap<>();
                    Map<String, Object> setPropBody = new LinkedHashMap<>();
                    setPropBody.put("name", placeholder);
                    setPropBody.put("expression", Map.of("simple", "${body}"));
                    setProp.put("setProperty", setPropBody);
                    childSteps.add(setProp);
                }
                childStart.ifPresent(cs ->
                    buildSteps(cs.path("id").asText(), allNodes, allEdges, childIds, new HashSet<>(), childSteps));

                int concurrency = data.path("concurrency").asInt(1);

                Map<String, Object> splitBody = new LinkedHashMap<>();
                splitBody.put("expression", splitExpr);
                if (concurrency > 1) {
                    splitBody.put("parallelProcessing", true);
                    splitBody.put("executorService", "splitPool-" + concurrency);
                }
                splitBody.put("steps", childSteps);

                Map<String, Object> splitStep = new LinkedHashMap<>();
                splitStep.put("split", splitBody);
                out.add(splitStep);

                // Continue to next node after iteration
                nextEdge(allEdges, nodeId, scopeIds)
                    .ifPresent(e -> buildSteps(e.path("target").asText(), allNodes, allEdges, scopeIds, visited, out));
                break;
            }

            default: {
                // Regular node: delegate to the plugin registry
                out.addAll(registry.convert(type, data));
                nextEdge(allEdges, nodeId, scopeIds)
                    .ifPresent(e -> buildSteps(e.path("target").asText(), allNodes, allEdges, scopeIds, visited, out));
                break;
            }
        }
    }

    // ── Merge-point detection ─────────────────────────────────────────────────

    /**
     * Returns the first node (by BFS order) that is reachable from BOTH branch
     * starting points, indicating the join point after a condition.
     */
    private String findMergePoint(String trueStart, String falseStart,
                                   List<JsonNode> allNodes, List<JsonNode> allEdges,
                                   Set<String> scopeIds, Set<String> alreadyVisited) {
        Set<String> fromTrue  = bfsReachable(trueStart,  allNodes, allEdges, scopeIds, alreadyVisited);
        Set<String> fromFalse = bfsReachable(falseStart, allNodes, allEdges, scopeIds, alreadyVisited);

        // Intersection in BFS (insertion) order so we get the earliest merge node
        for (String id : fromTrue) {
            if (fromFalse.contains(id)) return id;
        }
        return null;
    }

    private Set<String> bfsReachable(String startId,
                                      List<JsonNode> allNodes,
                                      List<JsonNode> allEdges,
                                      Set<String> scopeIds,
                                      Set<String> exclude) {
        Set<String> visited = new LinkedHashSet<>();
        if (startId == null) return visited;
        Queue<String> queue = new ArrayDeque<>();
        queue.add(startId);
        Set<String> seen = new HashSet<>(exclude);
        while (!queue.isEmpty()) {
            String id = queue.poll();
            if (seen.contains(id) || !scopeIds.contains(id)) continue;
            seen.add(id);
            visited.add(id);
            allEdges.stream()
                .filter(e -> id.equals(e.path("source").asText()))
                .map(e -> e.path("target").asText())
                .forEach(queue::add);
        }
        return visited;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static List<JsonNode> toList(JsonNode arrayNode) {
        if (arrayNode == null || !arrayNode.isArray()) return Collections.emptyList();
        return StreamSupport.stream(arrayNode.spliterator(), false).collect(Collectors.toList());
    }

    private static JsonNode findNode(List<JsonNode> nodes, String id) {
        return nodes.stream()
            .filter(n -> id.equals(n.path("id").asText()))
            .findFirst().orElse(null);
    }

    private static JsonNode edgeByHandle(List<JsonNode> edges, String sourceId, String handle) {
        return edges.stream()
            .filter(e -> sourceId.equals(e.path("source").asText())
                      && handle.equals(e.path("sourceHandle").asText()))
            .findFirst().orElse(null);
    }

    private static Optional<JsonNode> nextEdge(List<JsonNode> edges, String sourceId, Set<String> scopeIds) {
        return edges.stream()
            .filter(e -> sourceId.equals(e.path("source").asText())
                      && scopeIds.contains(e.path("target").asText()))
            .findFirst();
    }

    // ── YAML serialization ────────────────────────────────────────────────────

    private static String dumpYaml(List<Object> routes) {
        DumperOptions opts = new DumperOptions();
        opts.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        opts.setIndent(2);
        opts.setIndicatorIndent(2);
        opts.setIndentWithIndicator(true);
        return new Yaml(opts).dump(routes);
    }
}
