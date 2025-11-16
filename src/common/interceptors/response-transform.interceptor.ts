import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ERROR_CODES } from '../constants';

interface ResponseWithStatus {
  status: string;
  [key: string]: any;
}

const DEFAULT_SUCCESS_DESC = 'OK';

@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.transformResponse(data)));
  }

  private transformResponse(data: unknown): ResponseWithStatus {
    if (this.isObjectWithoutStatus(data)) {
      (data as ResponseWithStatus).status = ERROR_CODES.SUCCESS;
      return data as ResponseWithStatus;
    }

    if (this.isObjectWithStatus(data)) {
      return data;
    }

    return this.wrapPrimitiveResponse(data);
  }

  private isObjectWithoutStatus(data: unknown): boolean {
    return data !== null && typeof data === 'object' && !('status' in data);
  }

  private isObjectWithStatus(data: unknown): data is ResponseWithStatus {
    return data !== null && typeof data === 'object' && 'status' in data;
  }

  private wrapPrimitiveResponse(data: unknown): ResponseWithStatus {
    return {
      status: ERROR_CODES.SUCCESS,
      desc: DEFAULT_SUCCESS_DESC,
      value: data,
    };
  }
}
