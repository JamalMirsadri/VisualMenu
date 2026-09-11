export type JobType =
  | 'SEND_ORDER_NOTIFICATION'
  | 'DISPATCH_EMAIL'
  | 'GENERATE_SUMMARY_REPORT'
  | 'PROCESS_MEDIA';

export interface Job<T = any> {
  id: string;
  type: JobType;
  payload: T;
  createdAt: Date;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  error?: string;
}

class JobService {
  private jobs: Job[] = [];

  /**
   * Enqueues and executes a background job asynchronously without blocking the request thread.
   */
  public async dispatch<T>(type: JobType, payload: T): Promise<string> {
    const job: Job<T> = {
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      payload,
      createdAt: new Date(),
      status: 'PENDING',
    };

    this.jobs.push(job);

    // Run execution asynchronously
    setImmediate(async () => {
      job.status = 'RUNNING';
      try {
        await this.handleJob(job);
        job.status = 'COMPLETED';
      } catch (err: any) {
        job.status = 'FAILED';
        job.error = err.message || String(err);
        console.error(`[JobService] Job ${job.id} (${job.type}) failed:`, job.error);
      }
    });

    return job.id;
  }

  private async handleJob(job: Job): Promise<void> {
    switch (job.type) {
      case 'SEND_ORDER_NOTIFICATION':
        // Prepared for future push notifications/email hooks
        break;
      case 'DISPATCH_EMAIL':
        // Prepared for transactional SMTP/SES
        break;
      case 'GENERATE_SUMMARY_REPORT':
        // Prepared for daily analytics compilation
        break;
      case 'PROCESS_MEDIA':
        // Prepared for transcoding/thumbnailing
        break;
    }
  }

  public getJob(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }
}

export const jobService = new JobService();
