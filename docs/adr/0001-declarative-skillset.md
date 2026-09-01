# Use a declarative Skillset with one-way agent adapters

Skillset maintains one configuration as the desired state for all selected coding agents on a device. It discovers local skills, reports differences without changing them, and synchronizes only after explicit confirmation. This avoids the ambiguous ownership and conflict resolution of bidirectional synchronization while preserving each agent's native skill-loading convention through an adapter.
