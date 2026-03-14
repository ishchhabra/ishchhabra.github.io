import { mutationOptions } from "@tanstack/react-query";
import { subscribe } from "./api";

export function getSubscribeMutationOptions() {
  return mutationOptions({
    mutationFn: (email: string) => subscribe(email),
  });
}
