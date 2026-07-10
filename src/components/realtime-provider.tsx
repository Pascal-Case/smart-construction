"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";

export type EventType = "monthlyMemo.changed" | "site.changed" | "item.changed" | "contract.changed" | "revenue.changed";
export type RealtimeEvent = { id: number; type: EventType; entityId: string; siteId: string | null; month: string | null; actorId: string | null; occurredAt: string };
type Listener = (event: RealtimeEvent) => void;
type RealtimeState = {
  status: "connecting" | "connected" | "reconnecting";
  connectionEpoch: number;
  subscribe: (listener: Listener) => () => void;
};

const RealtimeContext = createContext<RealtimeState>({ status: "connecting", connectionEpoch: 0, subscribe: () => () => undefined });
const eventTypes: EventType[] = ["monthlyMemo.changed", "site.changed", "item.changed", "contract.changed", "revenue.changed"];

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<RealtimeState["status"]>("connecting");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const listeners = useRef(new Set<Listener>());
  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/events");
    const connected = () => {
      setStatus("connected");
      setConnectionEpoch((current) => current + 1);
    };
    const changed = (message: MessageEvent) => {
      const event = JSON.parse(message.data) as RealtimeEvent;
      setStatus("connected");
      listeners.current.forEach((listener) => listener(event));
    };
    source.addEventListener("connected", connected);
    for (const type of eventTypes) source.addEventListener(type, changed as EventListener);
    source.onerror = () => setStatus("reconnecting");
    return () => source.close();
  }, []);

  return <RealtimeContext value={{ status, connectionEpoch, subscribe }}>{children}</RealtimeContext>;
}

export function RealtimeStatus() {
  const { status } = useContext(RealtimeContext);
  const connected = status === "connected";
  return <Badge variant="outline" className={connected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}><span className={`mr-1.5 size-1.5 rounded-full ${connected ? "bg-emerald-500" : "animate-pulse bg-amber-500"}`} />{connected ? "실시간 연결" : status === "connecting" ? "연결 중" : "재연결 중"}</Badge>;
}

export function useRealtimeEvent(types: readonly EventType[], listener: Listener) {
  const { subscribe } = useContext(RealtimeContext);
  const listenerRef = useRef(listener);
  const typeKey = types.join("|");
  useEffect(() => { listenerRef.current = listener; }, [listener]);
  useEffect(() => {
    const accepted = new Set(typeKey.split("|") as EventType[]);
    return subscribe((event) => {
      if (accepted.has(event.type)) listenerRef.current(event);
    });
  }, [subscribe, typeKey]);
}

export function useRealtimeRefresh(types: readonly EventType[], refresh: () => void) {
  const { connectionEpoch } = useContext(RealtimeContext);
  const initialEpoch = useRef<number | null>(null);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useRealtimeEvent(types, () => refreshRef.current());
  useEffect(() => {
    if (connectionEpoch === 0) return;
    if (initialEpoch.current === null) { initialEpoch.current = connectionEpoch; return; }
    if (connectionEpoch > initialEpoch.current) {
      initialEpoch.current = connectionEpoch;
      refreshRef.current();
    }
  }, [connectionEpoch]);
}
