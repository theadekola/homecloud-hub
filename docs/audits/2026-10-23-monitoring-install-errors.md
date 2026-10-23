# Monitoring installation diagnostics

The previous generic host-action failure was returned after SSH connected and the remote action returned an error. It did not establish that the password was wrong. Package repository authentication, locks, DNS/network failures and installation errors were all hidden behind the same message.

Monitoring installation now checks package status first. If smartmontools, nut-client and nftables are already installed, it verifies them without refreshing repositories or reinstalling packages. Otherwise it refreshes package indexes, installs only the requested packages and verifies their final installed state.

APT failures produce fixed error codes and stages for repository authorization, invalid repository signatures/releases/certificates, package locks, DNS, network downloads, full disk, interrupted package state, missing APT, timeout and final verification failure. The controller maps recognized codes to fixed guidance. Raw host stderr, repository credentials and remote exception text are never returned. Partial apt-get update failures are not treated as successful index refreshes merely because the command exited zero.

The dialog keeps the verified SSH fingerprint for the same address and port after a failed action. It still pins the actual SSH host key on every connection. Editing the endpoint or explicitly reading a new fingerprint requires verification again. Passwords remain cleared immediately after submission, with an explanation that clearing does not mean rejection. Retrying requires a fresh password.

No repository configuration, subscription, authentication policy, package lock or existing service is changed by error handling. In particular, repository failures do not trigger automatic disabling of enterprise repositories or certificate checks. Host repository and package-manager issues still require investigation on that host.

Validation uses simulated package subprocess results, a real SSH fixture, paired-host authorization tests and rendered dialog tests. It does not establish the underlying cause on the user's live host; the submitted screenshot contained only the previous generic message.
