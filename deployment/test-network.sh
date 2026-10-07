#!/usr/bin/env bash
set -eu
source deployment/network.sh
# An actual Linux source address must be detected on the Ubuntu runner.
actual=$(detect_vm_ip)
[[ -n $actual ]]
ip() { echo '1.1.1.1 via 192.168.10.1 dev ens18 src 192.168.10.100 uid 0'; }
[[ $(detect_vm_ip) == 192.168.10.100 ]]
ip() {
  if [[ $1 == -4 ]]; then return 1; fi
  printf '3: docker0 inet 172.17.0.1/16 scope global docker0\n2: ens18 inet 192.168.20.10/24 scope global ens18\n'
}
[[ $(detect_vm_ip) == 192.168.20.10 ]]
ip() { return 1; }
if detect_vm_ip; then echo 'Missing address should fail' >&2; exit 1; fi
echo 'Default-route IP detection, interface fallback and missing-address checks passed.'
