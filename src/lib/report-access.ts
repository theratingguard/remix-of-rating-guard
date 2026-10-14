import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const reportAccessQuery = () =>
  queryOptions({
    queryKey: ["report-access-level"],
    queryFn: async () => {
      const result = await supabase.rpc("report_access_level").throwOnError();
      return result.data;
    },
  });
