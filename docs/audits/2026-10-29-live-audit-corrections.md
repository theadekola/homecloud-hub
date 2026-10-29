# Corrections following the live audit

## Docker collection

Direct and paired-connector container statistics now request `stream=false&one-shot=true`. Docker documents this option as fetching one sample without waiting for two collection cycles. CPU percentages use valid engine-provided prior counters, or a bounded baseline from the same connection/engine and container. First samples, expired baselines and counter resets remain unknown. Memory measurements remain available without waiting for a second CPU sample.

Baselines expire after two minutes and are bounded to 5,000 entries. Connector updates remain subject to the existing reviewed deployment workflow; installing the controller alone does not change a remote connector script.

Reference: https://docs.docker.com/reference/api/engine/version/v1.56/

## Failed backups

Proxmox collection now reads returned cluster task history and identifies recent, explicitly finished, failed backup tasks. These produce critical alerts without requiring metric threshold rules. Each task has its own identity. An online storage reading, missing history or the failure aging out of returned history does not resolve it. After investigation an operator may resolve it manually; that exact historical task does not reopen automatically.

This supplements offline backup-storage alerts. It does not prove filesystem writability, certify backup integrity or guarantee complete provider task history. A backup destination with USB I/O failures and an ext4 emergency read-only state needs storage repair outside this application patch; forcing a writable remount or running repair on a mounted filesystem is not part of this change.

## Validation

Regression coverage includes direct one-shot requests, per-host CPU baseline isolation, expired/reset/initial samples, paired connector request generation, task history availability, rule-independent backup alerts, retained unresolved failures and manual resolution. API and frontend suites, agent Python tests and production build are run separately. Live deployment and external notification delivery must be distinguished from these automated checks.
