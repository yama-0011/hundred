package com.recordhub.backend;

public class MessageLockedException extends RuntimeException {

    public MessageLockedException(Long id, Throwable cause) {
        super("Message is being updated: " + id, cause);
    }
}
