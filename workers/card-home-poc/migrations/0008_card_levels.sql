CREATE TABLE card_levels (
  card_id TEXT NOT NULL,
  level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 3),
  required_cores INTEGER NOT NULL CHECK(required_cores >= 0),
  bp INTEGER NOT NULL CHECK(bp >= 0),
  PRIMARY KEY(card_id, level)
);

