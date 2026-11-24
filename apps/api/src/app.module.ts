import { Module } from "@nestjs/common";
import { AuthGuard } from "./auth.guard.js";
import { AttachmentStorageService } from "./attachment-storage.service.js";
import { CalendarController } from "./calendar.controller.js";
import { CalendarService } from "./calendar.service.js";
import { DatabaseService } from "./database.service.js";
import { FamilyController } from "./family.controller.js";
import { FamilyService } from "./family.service.js";
import { HealthController } from "./health.controller.js";
import { MobileVersionController } from './mobile-version.controller.js';
import { GoalsController } from "./goals.controller.js";
import { GoalsService } from "./goals.service.js";
import { InngestController } from "./inngest.controller.js";
import { NotificationsController } from "./notifications.controller.js";
import { RemindersService } from "./reminders.service.js";
import { InvitationMailService } from "./invitation-mail.service.js";
import { JobsDatabaseService } from "./jobs-database.service.js";
import { JobsService } from "./jobs.service.js";
import { PrivacyController } from "./privacy.controller.js";
import { ProfileController } from "./profile.controller.js";
import { StatusController } from "./status.controller.js";
import { TaskSeriesController } from "./task-series.controller.js";
import { TaskSeriesService } from "./task-series.service.js";
import { TasksController } from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";
import { ChannelsController } from "./channels.controller.js";
import { ChannelsService } from "./channels.service.js";
import { ChannelRealtimeService } from "./channel-realtime.service.js";
import {GuestsController} from './guests.controller.js';
import {GuestsService} from './guests.service.js';
import {FilesController} from './files.controller.js';
import {ChatStatusController} from './chat-status.controller.js';
import {PushController} from './push.controller.js';
import {PushService} from './push.service.js';
import { AndroidPushController, AndroidPushRevocationController } from './android-push.controller.js';
import { AndroidPushService } from './android-push.service.js';
import {FilesService} from './files.service.js';
import { FamilyBaseController } from "./family-base.controller.js";
import { FamilyEntriesService } from "./family-entries.service.js";
import { FamilyAiController } from "./family-ai.controller.js";
import { FamilyAiService } from "./family-ai.service.js";
import { FamilyBaseService } from "./family-base.service.js";

@Module({
  controllers: [HealthController, MobileVersionController, ProfileController, StatusController, FamilyController, PrivacyController, CalendarController,
    TasksController, TaskSeriesController, InngestController,
    NotificationsController, GoalsController, ChannelsController,GuestsController,FilesController,ChatStatusController,PushController,AndroidPushController,AndroidPushRevocationController,FamilyBaseController,FamilyAiController],
  providers: [AuthGuard, DatabaseService, FamilyService, InvitationMailService, CalendarService, AttachmentStorageService,
    TasksService, TaskSeriesService, JobsDatabaseService, JobsService, RemindersService, GoalsService, ChannelsService, ChannelRealtimeService,PushService,AndroidPushService,GuestsService,FilesService,FamilyBaseService,FamilyEntriesService,FamilyAiService],
})
export class AppModule {}
