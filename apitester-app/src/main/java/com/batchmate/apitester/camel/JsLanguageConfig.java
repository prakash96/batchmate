package com.batchmate.apitester.camel;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers GraalVM JavaScript as Camel's "js" language so that YAML DSL
 * expressions (expression: js: "...") and script steps resolve correctly.
 * Copied verbatim from workflow-app.
 */
@Configuration
public class JsLanguageConfig {

    private static final Logger log = LoggerFactory.getLogger(JsLanguageConfig.class);

    @Bean("js")
    public JsLanguage jsLanguage() {
        log.info("Registering GraalVM JS as Camel 'js' language");
        return new JsLanguage();
    }
}
