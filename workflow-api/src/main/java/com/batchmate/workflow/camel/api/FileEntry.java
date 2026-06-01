package com.batchmate.workflow.camel.api;

/**
 * Represents one item returned by File List, FTP List, and SFTP List operations.
 *
 * Using a POJO with proper getters means ${body.filePath} and ${body.fileName}
 * work in every Camel context — Simple OGNL, JavaScript interop, and URI expressions —
 * because Camel can find getFilePath() / getFileName() via standard bean reflection.
 *
 * LinkedHashMap was previously used but its entries are not accessible via OGNL
 * (camel-bean throws MethodNotFoundException for "filePath" since there is no such method).
 */
public final class FileEntry {

    private final String filePath;
    private final String fileName;

    public FileEntry(String filePath, String fileName) {
        this.filePath = filePath;
        this.fileName = fileName;
    }

    public String getFilePath() { return filePath; }
    public String getFileName() { return fileName; }

    @Override
    public String toString() {
        return "{filePath=" + filePath + ", fileName=" + fileName + "}";
    }
}
