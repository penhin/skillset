# Make managed Skill deployment recoverable with local snapshots

Before a Skillset replaces a same-named Skill in an agent, it stores that agent's original content in local application state. Removing the Skillset removes Managed Skills and restores those snapshots. Snapshots are device- and agent-specific, so they are not committed to the remote Skills Repository; an incomplete snapshot blocks restoration rather than risking data loss.
