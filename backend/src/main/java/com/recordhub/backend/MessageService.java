package com.recordhub.backend;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.dao.EmptyResultDataAccessException;

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

        public Message updateMessage(Long id, String content) {
            int updatedRows =
                    messageRepository.updateContent(id, content);

            if (updatedRows == 0) {
                throw new MessageNotFoundException(id);
            }

            return messageRepository.findById(id);
        }
}