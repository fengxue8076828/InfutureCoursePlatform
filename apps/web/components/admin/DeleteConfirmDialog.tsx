"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";

export type DeleteConfirmOptions = {
  title?: string;
  itemName?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type DeleteConfirmRequest = Required<Pick<DeleteConfirmOptions, "title" | "description" | "confirmLabel" | "cancelLabel">> & {
  itemName?: string;
};

const defaultDeleteConfirmRequest: DeleteConfirmRequest = {
  title: "确认删除",
  description: "删除后可能无法恢复，请确认是否继续。",
  confirmLabel: "确认删除",
  cancelLabel: "取消"
};

export function useDeleteConfirmation() {
  const [request, setRequest] = useState<DeleteConfirmRequest | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  function confirmDelete(options: DeleteConfirmOptions = {}) {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setRequest({ ...defaultDeleteConfirmRequest, ...options });
    });
  }

  function resolveDeleteConfirmation(confirmed: boolean) {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
  }

  return {
    confirmDelete,
    deleteConfirmDialog: request ? (
      <DeleteConfirmDialog
        request={request}
        onCancel={() => resolveDeleteConfirmation(false)}
        onConfirm={() => resolveDeleteConfirmation(true)}
      />
    ) : null
  };
}

function DeleteConfirmDialog({
  request,
  onCancel,
  onConfirm
}: {
  request: DeleteConfirmRequest;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/45 px-4 py-8">
      <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-coral/10 text-coral">
              <AlertTriangle size={22} />
            </span>
            <div>
              <p className="text-lg font-bold text-ink">{request.title}</p>
              {request.itemName ? (
                <p className="mt-1 break-words text-sm font-semibold text-slate-600">{request.itemName}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500"
            aria-label="关闭"
          >
            <X size={17} />
          </button>
        </div>
        <p className="mt-4 leading-6 text-slate-600">{request.description}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
          >
            {request.cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-coral px-4 py-2 text-sm font-bold text-white"
          >
            <Trash2 size={16} /> {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}