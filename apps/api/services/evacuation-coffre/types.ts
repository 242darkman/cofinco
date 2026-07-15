export interface ServiceResult<T = any> {
  success: boolean;
  errorCode?: string;
  error?: string;
  evacuation?: T;
  data?: any;
  pagination?: any;
  stats?: any;
  document?: any;
}
