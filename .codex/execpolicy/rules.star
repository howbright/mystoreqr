prefix_rule(
    pattern = ["git", "add"],
    decision = "allow",
    justification = "Allow staging changes in this trusted project",
)

prefix_rule(
    pattern = ["git", "commit"],
    decision = "allow",
    justification = "Allow local commits in this trusted project",
)

prefix_rule(
    pattern = ["git", "status"],
    decision = "allow",
    justification = "Allow repository status checks",
)

prefix_rule(
    pattern = ["git", "diff"],
    decision = "allow",
    justification = "Allow diff inspection",
)

prefix_rule(
    pattern = ["git", "log"],
    decision = "allow",
    justification = "Allow log inspection",
)
