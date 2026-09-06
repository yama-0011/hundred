package com.recordhub.backend;

public class MessageNotFoundException extends RuntimeException {

    public MessageNotFoundException(Long id) {
        super("Message not found: " + id);
    }
}