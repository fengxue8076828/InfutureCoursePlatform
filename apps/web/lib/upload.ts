import { apiConnectionErrorMessage } from "./api-config";

export type UploadProgress = {
  loaded: number;
  total: number | null;
  percent: number;
};

export function uploadFormDataWithProgress<T>({
  url,
  formData,
  headers,
  onProgress,
  timeoutMs = 0
}: {
  url: string;
  formData: FormData;
  headers?: Record<string, string>;
  onProgress?: (progress: UploadProgress) => void;
  timeoutMs?: number;
}) {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.timeout = timeoutMs;

    Object.entries(headers ?? {}).forEach(([key, value]) => {
      request.setRequestHeader(key, value);
    });

    request.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : null;
      const percent = total ? Math.max(1, Math.min(99, Math.round((event.loaded / total) * 100))) : 1;
      onProgress?.({ loaded: event.loaded, total, percent });
    };

    request.onload = () => {
      const rawText = typeof request.responseText === "string" ? request.responseText : "";
      let payload: unknown = null;
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          payload = null;
        }
      }

      if (request.status >= 200 && request.status < 300) {
        onProgress?.({ loaded: 1, total: 1, percent: 100 });
        resolve(payload as T);
        return;
      }

      const detail =
        payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string"
          ? payload.detail
          : "";
      if (request.status === 413) {
        reject(new Error("文件太大，请压缩后再上传。"));
        return;
      }
      reject(new Error(detail || `上传失败，服务器返回 ${request.status}。`));
    };

    request.onerror = () => reject(new Error(apiConnectionErrorMessage("无法连接上传服务")));
    request.ontimeout = () => reject(new Error("上传超时，请检查网络后重试。"));
    request.onabort = () => reject(new Error("上传已取消。"));

    onProgress?.({ loaded: 0, total: null, percent: 1 });
    request.send(formData);
  });
}
