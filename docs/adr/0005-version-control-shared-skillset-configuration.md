# Version-control the shared Skillset configuration with the remote Skills Repository

When a Remote Skills Repository is configured, its repository also stores the version-controlled Skillset configuration: selected Skills, Target Coding Agents, and the recorded repository revision. This lets devices reproduce the same intended configuration through normal Git workflows. When no remote repository exists, the configuration remains local. Original-state snapshots never leave local application state because they are specific to an execution environment and agent.
