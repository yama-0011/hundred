package com.recordhub.backend;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MessageRepository {

    private final JdbcTemplate jdbcTemplate;

    public MessageRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Message> findAll() {
        String sql = """
                SELECT id, content
                FROM messages
                ORDER BY id
                """;

        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new Message(
                        rs.getLong("id"),
                        rs.getString("content")
                )
        );
    }

    public Message findById(Long id) {
        String sql = """
                SELECT id, content
                FROM messages
                WHERE id = ?
                """;

        return jdbcTemplate.queryForObject(
                sql,
                (rs, rowNum) -> new Message(
                        rs.getLong("id"),
                        rs.getString("content")
                ),
                id
        );
    }

    public Message save(String content) {
        String sql = """
                INSERT INTO messages (content)
                VALUES (?)
                RETURNING id, content
                """;

        return jdbcTemplate.queryForObject(
                sql,
                (rs, rowNum) -> new Message(
                        rs.getLong("id"),
                        rs.getString("content")
                ),
                content
        );
    }

    public int deleteById(Long id) {
        String sql = """
                DELETE FROM messages
                WHERE id = ?
                """;

        return jdbcTemplate.update(sql, id);
    }

    public int updateContent(Long id, String content) {
        String sql = """
                UPDATE messages
                SET content = ?
                WHERE id = ?
                """;

        return jdbcTemplate.update(sql, content, id);
    }
}