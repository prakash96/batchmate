package com.batchmate.workflow.camel.api;

import java.util.Collections;
import java.util.Map;

public interface NodeConverterPlugin {
    String pluginId();
    Map<String, NodeConverter> converters();

    /** Optional Camel registry beans contributed by this plugin. */
    default Map<String, Object> beans() { return Collections.emptyMap(); }

    /** Optional connection testers keyed by connection type (e.g. "sftp", "postgresql"). */
    default Map<String, ConnectionTester> connectionTesters() { return Collections.emptyMap(); }
}
