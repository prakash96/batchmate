package com.batchmate.workflow.logging;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import com.batchmate.workflow.util.PathResolver;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Registers the RunLogAppender with relevant loggers so every workflow run
 * gets its own log file under {workflows.base-dir}/run-logs/.
 *
 * Loggers attached:
 *   org.apache.camel   — Camel route/component INFO logs
 *   com.batchmate      — our own controller / service logs
 */
@Component
public class RunLoggingSetup {

    @Value("${workflows.base-dir:../workflows}")
    private String baseDirConfig;

    private Path runLogsDir;

    @PostConstruct
    public void init() throws IOException {
        runLogsDir = PathResolver.resolveDir(baseDirConfig, "workflows").resolve("run-logs");
        Files.createDirectories(runLogsDir);

        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();

        RunLogAppender appender = new RunLogAppender();
        appender.setRunLogsDir(runLogsDir);
        appender.setContext(ctx);
        appender.setName("RUN_LOG_APPENDER");
        appender.start();

        // Camel route + component logs at DEBUG so step-level execution is captured
        Logger camelLogger = ctx.getLogger("org.apache.camel");
        camelLogger.setLevel(Level.INFO);
        camelLogger.addAppender(appender);

        // Our own workflow code
        Logger batchmateLogger = ctx.getLogger("com.batchmate");
        batchmateLogger.addAppender(appender);
    }

    public Path getRunLogsDir() {
        return runLogsDir;
    }

    public Path getRunLogPath(String runId) {
        return runLogsDir.resolve(runId + ".log");
    }
}
