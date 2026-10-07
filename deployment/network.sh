#!/usr/bin/env bash
# Route lookup selects the VM's default outbound source address without sending packets.
detect_vm_ip() {
  local candidate octet
  candidate=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1);exit}}' || true)
  if [[ -z $candidate ]]; then
    candidate=$(ip -o -4 addr show scope global 2>/dev/null | awk '$2 !~ /^(lo|docker|veth|br-|tailscale)/ {split($4,a,"/");print a[1];exit}' || true)
  fi
  [[ $candidate =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && $candidate != 127.* && $candidate != 0.* ]] || return 1
  local -a octets
  IFS=. read -r -a octets <<< "$candidate"
  for octet in "${octets[@]}"; do
    [[ ${#octet} -le 3 ]] && ((10#$octet <= 255)) || return 1
  done
  printf '%s\n' "$candidate"
}
