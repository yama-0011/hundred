package com.recordhub.backend;

import java.util.List;
import java.sql.SQLException;
import org.springframework.stereotype.Service;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MessageService {

    private final MessageRepository messageRepository;

    public MessageService(MessageRepository messageRepository) {
        this.messageRepository = messageRepository;
    }

    public List<Message> getMessages() {
        return messageRepository.findAll();
    }

    public Message getMessageById(Long id) {
        // try {
            return messageRepository.findById(id);
        // } 
        // catch (EmptyResultDataAccessException e) {
        //     throw new MessageNotFoundException(id);
        // }
    }

    public Message createMessage(String content) {
        return messageRepository.save(content);
    }

    public void deleteMessage(Long id) {
        int deletedRows = messageRepository.deleteById(id);

        if (deletedRows == 0) {
            throw new MessageNotFoundException(id);
        }
    }

    @Transactional
    public Message updateMessage(Long id, String content, LockMode lockMode) {
        try {
            messageRepository.lockById(id, lockMode);
        } catch (EmptyResultDataAccessException exception) {
            throw new MessageNotFoundException(id);
        } catch (DataAccessException exception) {
            if (isLockUnavailable(exception)) {
                throw new MessageLockedException(id, exception);
            }
            throw exception;
        }

        messageRepository.updateContent(id, content);
        return messageRepository.findById(id);
    }

    private boolean isLockUnavailable(Throwable exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sqlException
                    && "55P03".equals(sqlException.getSQLState())) {
                return true;
            }
        }
        return false;
    }
}
