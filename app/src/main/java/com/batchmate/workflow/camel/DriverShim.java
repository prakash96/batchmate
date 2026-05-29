package com.batchmate.workflow.camel;

import java.sql.*;
import java.util.Properties;
import java.util.logging.Logger;

/**
 * Wraps a JDBC Driver loaded from a plugin URLClassLoader so that DriverManager
 * (which uses the app classloader) can delegate to it. Without this shim,
 * DriverManager filters out drivers whose classes are invisible to the caller's classloader.
 */
public class DriverShim implements Driver {

    private final Driver delegate;

    public DriverShim(Driver d) { this.delegate = d; }

    @Override
    public Connection connect(String url, Properties info) throws SQLException {
        return delegate.connect(url, info);
    }

    @Override
    public boolean acceptsURL(String url) throws SQLException {
        return delegate.acceptsURL(url);
    }

    @Override
    public DriverPropertyInfo[] getPropertyInfo(String url, Properties info) throws SQLException {
        return delegate.getPropertyInfo(url, info);
    }

    @Override public int getMajorVersion() { return delegate.getMajorVersion(); }
    @Override public int getMinorVersion() { return delegate.getMinorVersion(); }
    @Override public boolean jdbcCompliant() { return delegate.jdbcCompliant(); }

    @Override
    public Logger getParentLogger() throws SQLFeatureNotSupportedException {
        return delegate.getParentLogger();
    }
}
