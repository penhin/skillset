# Retain successful agent updates during partial synchronization

Synchronization updates each Coding Agent independently. If an adapter cannot write to one agent, successful updates to other agents remain in place and the failure is reported for retry. A cross-agent rollback is not attempted because the agents have independent configuration boundaries and cannot provide a reliable shared transaction.
