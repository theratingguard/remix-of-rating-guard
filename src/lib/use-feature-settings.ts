import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFeatureSettings } from "./settings.functions";
export function useFeatureSettings() {
  const load = useServerFn(getFeatureSettings);
  return useQuery({
    queryKey: ["feature-settings"],
    queryFn: () => load(),
    staleTime: 60000,
    refetchInterval: 60000,
  });
}
