"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge }   from "@/components/ui/badge";
import { Button }  from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Channel {
  id: number; name: string; type: string; status: number;
  response_time: number; test_time: string;
}

export default function AdminChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    // In production, fetch from New API gateway admin API
    setTimeout(() => {
      setChannels([
        { id: 1, name: "OpenAI Primary",   type: "OpenAI",    status: 1, response_time: 820,  test_time: "2 min ago" },
        { id: 2, name: "OpenAI Backup",    type: "OpenAI",    status: 1, response_time: 950,  test_time: "2 min ago" },
        { id: 3, name: "Anthropic Primary",type: "Anthropic", status: 1, response_time: 1240, test_time: "2 min ago" },
        { id: 4, name: "Anthropic Backup", type: "Anthropic", status: 1, response_time: 1380, test_time: "5 min ago" },
        { id: 5, name: "Gemini Primary",   type: "Google",    status: 1, response_time: 640,  test_time: "2 min ago" },
        { id: 6, name: "DeepSeek Primary", type: "DeepSeek",  status: 1, response_time: 490,  test_time: "2 min ago" },
      ]);
      setLoading(false);
    }, 800);
  }, []);

  const providerColors: Record<string, string> = {
    OpenAI:    "text-emerald-400",
    Anthropic: "text-orange-400",
    Google:    "text-blue-400",
    DeepSeek:  "text-purple-400",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">القنوات</h1>
        <Button variant="secondary" size="sm">+ إضافة قناة</Button>
      </div>

      <div className="grid gap-4">
        {loading
          ? [1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)
          : channels.map(ch => (
            <Card key={ch.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${ch.status === 1 ? "bg-emerald-400" : "bg-red-400"} animate-pulse`} />
                    <div>
                      <p className="font-semibold text-white">{ch.name}</p>
                      <p className={`text-sm font-medium ${providerColors[ch.type] ?? "text-slate-400"}`}>{ch.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="text-slate-400 text-xs">الاستجابة</p>
                      <p className={`font-mono font-semibold ${ch.response_time < 1000 ? "text-emerald-400" : ch.response_time < 2000 ? "text-amber-400" : "text-red-400"}`}>
                        {ch.response_time}ms
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-400 text-xs">آخر اختبار</p>
                      <p className="text-slate-300 text-xs">{ch.test_time}</p>
                    </div>
                    <Badge variant={ch.status === 1 ? "success" : "error"}>
                      {ch.status === 1 ? "متاح" : "معطل"}
                    </Badge>
                    <button className="text-xs text-red-400 hover:underline">تعطيل</button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        }
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold text-white">إضافة قناة جديدة</h2></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-400">
            لإضافة قناة، انتقل إلى لوحة تحكم New API مباشرةً على المنفذ الداخلي.
            ثم أعد تشغيل هذه الصفحة لرؤية القنوات المحدثة.
          </p>
          <div className="bg-[#0F172A] rounded-xl p-3 font-mono text-sm text-slate-300 border border-slate-700" dir="ltr">
            docker compose exec gateway sh -c "echo 'New API running on :3000'"
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
