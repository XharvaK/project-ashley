#define _GNU_SOURCE
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>
#include <stdio.h>

int main(void) {
  struct ucred peer;
  socklen_t length = sizeof(peer);
  if (getsockopt(STDIN_FILENO, SOL_SOCKET, SO_PEERCRED, &peer, &length) != 0) {
    return 1;
  }
  if (printf("%ld %ld %ld\n", (long) peer.pid, (long) peer.uid, (long) peer.gid) < 0) {
    return 1;
  }
  return fflush(stdout) == 0 ? 0 : 1;
}
