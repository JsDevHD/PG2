import { axiosInstance } from "@/lib/axios";
import type {
  TokenResponse,
  UserLoginRequest,
  UserPublicResponse,
  UserRegisterRequest,
  UserResponse,
} from "@/types/api";

export async function login(body: UserLoginRequest): Promise<TokenResponse> {
  const { data } = await axiosInstance.post<TokenResponse>("/api/v1/auth/login", body);
  return data;
}

export async function register(body: UserRegisterRequest): Promise<UserResponse> {
  const { data } = await axiosInstance.post<UserResponse>("/api/v1/auth/register", body);
  return data;
}

export async function getMe(): Promise<UserResponse> {
  const { data } = await axiosInstance.get<UserResponse>("/api/v1/auth/me");
  return data;
}

/** Auth Service acepta hasta 100 ids por llamada; se divide en lotes. */
const BATCH_SIZE = 100;

export async function getUsersBatch(ids: string[]): Promise<UserPublicResponse[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) batches.push(unique.slice(i, i + BATCH_SIZE));
  const results = await Promise.all(
    batches.map((batch) =>
      axiosInstance
        .get<UserPublicResponse[]>("/api/v1/users/batch", { params: { ids: batch.join(",") } })
        .then((response) => response.data),
    ),
  );
  return results.flat();
}
