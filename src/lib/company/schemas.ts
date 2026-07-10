import { z } from "zod";

export const companySettingInputSchema = z.object({
  businessRegistrationNo: z.string().trim().min(1, "등록번호를 입력해 주세요.").max(30),
  companyName: z.string().trim().min(1, "상호를 입력해 주세요.").max(100),
  representativeName: z.string().trim().min(1, "대표자 성명을 입력해 주세요.").max(50),
  address: z.string().trim().min(1, "사업장 주소를 입력해 주세요.").max(300),
  businessType: z.string().trim().min(1, "업태를 입력해 주세요.").max(100),
  businessItem: z.string().trim().min(1, "종목을 입력해 주세요.").max(100),
  phone: z.string().trim().min(1, "전화번호를 입력해 주세요.").max(50),
  defaultMessage: z.string().trim().min(1, "공급 안내 문구를 입력해 주세요.").max(200),
  version: z.number().int().positive().nullable().optional(),
});

export type CompanySettingInput = z.infer<typeof companySettingInputSchema>;
