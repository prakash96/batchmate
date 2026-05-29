package com.batchmate.workflow.logging;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Set;

/**
 * Logback appender that writes log events to a per-run file.
 *
 * Only fires when the SLF4J MDC contains a "runId" key — logs produced
 * outside a workflow run are silently ignored, so no idle/default file
 * is created.
 *
 * Noisy Camel internal loggers are skipped; only step-execution and
 * component-level events are written.
 */
public class RunLogAppender extends AppenderBase<ILoggingEvent> {

    // High-frequency internal Camel loggers that produce no actionable output
    private static final Set<String> SKIP_LOGGERS = Set.of(
        "org.apache.camel.impl.engine.MDCUnitOfWork",
        "org.apache.camel.impl.engine.DefaultUnitOfWork",
        "org.apache.camel.impl.engine.DefaultInflightRepository",
        "org.apache.camel.impl.engine.DefaultExchangeFactory",
        "org.apache.camel.impl.engine.DefaultReactiveExecutor",
        "org.apache.camel.support.DefaultExchange",
        "org.apache.camel.support.DefaultMessage",
        "org.apache.camel.support.MessageHelper"
    );

    private volatile Path runLogsDir;

    public void setRunLogsDir(Path dir) {
        this.runLogsDir = dir;
    }

    @Override
    protected void append(ILoggingEvent event) {
        String runId = event.getMDCPropertyMap().get("runId");
        if (runId == null || runLogsDir == null) return;

        // Skip known-noisy internal loggers
        if (SKIP_LOGGERS.contains(event.getLoggerName())) return;

        if (!event.getLevel().isGreaterOrEqual(Level.INFO)) return;

        String line = format(event);
        Path logFile = runLogsDir.resolve(runId + ".log");
        try {
            Files.writeString(logFile, line + System.lineSeparator(),
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.APPEND);
        } catch (IOException ignored) {}
    }

    private static String format(ILoggingEvent event) {
        String time  = new SimpleDateFormat("HH:mm:ss.SSS").format(new Date(event.getTimeStamp()));
        String level = String.format("%-5s", event.getLevel().levelStr);
        String logger = abbreviated(event.getLoggerName());
        return "[" + time + "] " + level + " " + logger + " — " + event.getFormattedMessage();
    }

    private static String abbreviated(String name) {
        String[] parts = name.split("\\.");
        if (parts.length >= 2) return parts[parts.length - 2] + "." + parts[parts.length - 1];
        return name;
    }
}
