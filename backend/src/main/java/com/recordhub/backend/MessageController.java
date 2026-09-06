package com.recordhub.backend;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;

@RestController
public class MessageController {

    private final MessageService messageService;

    public MessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    @GetMapping("/api/messages/{id}")
    public Message getMessage(@PathVariable Long id) {
        return messageService.getMessageById(id);
    }

    @PostMapping("/api/messages")
    public ResponseEntity<Message> createMessage(
            @Valid@RequestBody CreateMessageRequest request) {

        Message savedMessage =
                messageService.createMessage(request.content());

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(savedMessage);
    }

    public record CreateMessageRequest(
        @NotBlank
        @Size(max = 200)
        String content) {
    }

    @DeleteMapping("/api/messages/{id}")
    public ResponseEntity<Void> deleteMessage(
            @PathVariable("id") Long id) {

        messageService.deleteMessage(id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/api/messages/{id}")
    public Message updateMessage(
            @PathVariable("id") Long id,
            @Valid @RequestBody UpdateMessageRequest request) {

        return messageService.updateMessage(
                id,
                request.content()
        );
    }

    public record UpdateMessageRequest(
            @NotBlank
            @Size(max = 200)
            String content
    ) {
    }
}