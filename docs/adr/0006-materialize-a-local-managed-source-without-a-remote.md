# Materialize a local managed source when no remote repository exists

When users build a Skillset from locally discovered skills without a Remote Skills Repository, Skillset copies each selected Skill into its own local managed source. Synchronization reads from that stable source rather than from an agent's live skill directory, which might later be changed, removed, or restored independently.
