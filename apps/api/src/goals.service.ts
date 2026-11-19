import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { z } from "zod";
import { DatabaseService } from "./database.service.js";
import { familyTimeZone } from "./family-time-zone.js";
import {
  goalCategories, goalModes, goalPriorities,
  type CreateGoalInput, type GoalDetailDto, type GoalDto, type GoalItemDto, type GoalListInput, type GoalPageDto,
  type GoalSummaryDto, type UpdateGoalInput, type LinkGoalTaskDto, type LinkableTasksInput, type LinkableTaskPageDto, type LinkableTaskDto,
} from "./goals.dto.js";
import { decodeCursor, encodeCursor, taskClock } from "./task-rules.js";
import { Params, person } from "./tasks.service.js";
import { generateOccurrences } from "./task-series.store.js";

type GoalRow = {
  id: string; authorId: string; title: string; description: string; type: GoalDto["type"];
  category: GoalDto["category"]; priority: GoalDto["priority"]; targetDate: string | null;
  audience: NonNullable<GoalDto["audience"]>; selectedMemberIds: string[]; assigneeId: string | null;
  mode: GoalDto["mode"]; current: string | null; target: string | null; unit: string | null;
  itemCount: number; completedCount: number; excludedCount: number; percentage: string | null; completedAt: Date | null;
  archived: boolean; version: number; sortDate: string; sortChange: string; sortCreated: string;
};
type GoalContext = { names: Map<string, string>; today: string };
const fields = `
  g.id, g.author_id as "authorId", g.title, g.description, g.goal_type as type, g.category, g.priority,
  g.target_date::text as "targetDate", g.audience, g.selected_member_ids as "selectedMemberIds",
  g.assignee_id as "assigneeId", g.progress_mode as mode, g.current_value as current, g.target_value as target, g.unit,
  g.item_count as "itemCount", g.completed_count as "completedCount", g.excluded_count as "excludedCount", g.percentage,
  g.completed_at as "completedAt", g.archived_at is not null as archived, g.version
`;
const cursorSchema = z.tuple([z.string().max(64), z.string().max(64), z.string().max(64), z.uuid()]);

function toGoal(row: GoalRow, actor: string, context: GoalContext): GoalDto {
  const assigned = row.assigneeId !== null && context.names.has(row.assigneeId);
  return {
    id: row.id, title: row.title, description: row.description, type: row.type, category: row.category,
    priority: row.priority, targetDate: row.targetDate, audience: row.audience, mode: row.mode, unit: row.unit,
    itemCount: row.itemCount, completedCount: row.completedCount, excludedCount: row.excludedCount, version: row.version, archived: row.archived,
    selectedMemberIds: actor === row.authorId ? row.selectedMemberIds : [],
    current: row.current === null ? null : Number(row.current), target: row.target === null ? null : Number(row.target),
    percentage: row.percentage === null ? null : Number(row.percentage),
    completedAt: row.completedAt?.toISOString() ?? null, status: row.completedAt ? "completed" : "active",
    author: person(row.authorId, context.names)!, assignee: person(row.assigneeId, context.names),
    canEdit: row.authorId === actor,
    canProgress: !row.archived && (row.type === "family" || assigned) &&
      (row.type === "family" || actor === row.authorId || actor === row.assigneeId),
    needsReassignment: row.type === "individual" && !assigned,
    pastTarget: !row.completedAt && !!row.targetDate && row.targetDate < context.today,
  };
}

@Injectable()
export class GoalsService {
  constructor(private readonly database: DatabaseService) {}

  private async run<T>(actor: string, familyId: string, work: (client: PoolClient, context: GoalContext) => Promise<T>) {
    try {
      return await this.database.withActor(actor, async (client) => {
        const { rows: [family] } = await client.query<{ timeZone: string }>(
          'select time_zone as "timeZone" from app.families where id = $1', [familyId],
        );
        if (!family) throw new NotFoundException("Family workspace not found.");
        const { rows: members } = await client.query<{ id: string; name: string }>(
          `select user_id as id, btrim(first_name || ' ' || last_name) as name from app.list_family_members($1)`, [familyId],
        );
        const names = new Map(members.map((member) => [member.id, member.name || "Family member"]));
        return work(client, { names, today: taskClock(familyTimeZone(family.timeZone)).today });
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P0002") throw new NotFoundException("Goal or checklist item not found.");
      if (code === "42501") throw new ForbiddenException("You don’t have permission to make this goal change.");
      if (code === "40001") throw new ConflictException("This goal changed since you opened it. Reload to see the latest version.");
      if (code === "23505") throw new ConflictException("This ID is already in use. Reload and try again.");
      if (["22023", "23514", "23502", "22003", "22P02"].includes(code ?? "")) {
        throw new BadRequestException(code === "22023" ? (error as Error).message : "Check the goal details, assignment, and progress values.");
      }
      throw error;
    }
  }

  list(actor: string, familyId: string, query: GoalListInput): Promise<GoalPageDto> {
    return this.run(actor, familyId, async (client, context) => {
      const params = new Params();
      const filters = this.filters(params, familyId, actor, query);
      filters.push(query.archived === "true" ? "g.archived_at is not null" : "g.archived_at is null");
      if (query.status) filters.push(query.status === "completed" ? "g.completed_at is not null" : "g.completed_at is null");
      const changeOrder = query.archived === "true" ? "-extract(epoch from g.archived_at)"
        : query.status === "completed" ? "-extract(epoch from g.completed_at)" : "0::numeric";
      const dateOrder = query.archived === "true" || query.status === "completed" ? "'infinity'::date" : "coalesce(g.target_date, 'infinity'::date)";
      const order = "(" + dateOrder + ", " + changeOrder + ", g.created_at, g.id)";
      if (query.cursor) {
        const cursor = cursorSchema.safeParse(decodeCursor(query.cursor));
        if (!cursor.success) throw new BadRequestException("The goal page cursor is invalid.");
        const [date, change, created, id] = cursor.data;
        if ((date !== "infinity" && !z.iso.date().safeParse(date).success) || !Number.isFinite(Number(change))
          || !Number.isFinite(Date.parse(created))) throw new BadRequestException("The goal page cursor is invalid.");
        filters.push(order + " > (" + [params.add(date, "date"), params.add(change, "numeric"),
          params.add(created, "timestamptz"), params.add(id, "uuid")].join(", ") + ")");
      }
      const limit = query.limit ?? 50;
      const { rows } = await client.query<GoalRow>(`
        select ${fields}, (${dateOrder})::text as "sortDate", (${changeOrder})::text as "sortChange",
          g.created_at::text as "sortCreated" from app.goals g where ${filters.join(" and ")}
        order by ${order} limit ${limit + 1}
      `, params.values);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return { today: context.today, goals: page.map((row) => toGoal(row, actor, context)),
        nextCursor: rows.length > limit && last ? encodeCursor([last.sortDate, last.sortChange, last.sortCreated, last.id]) : null };
    });
  }

  summary(actor: string, familyId: string, query: GoalListInput): Promise<GoalSummaryDto> {
    return this.run(actor, familyId, async (client) => {
      const params = new Params();
      const filters = this.filters(params, familyId, actor, query);
      const { rows: [row] } = await client.query<Omit<GoalSummaryDto, "average"> & { average: string | null }>(`
        select count(*) filter (where archived_at is null)::int as total,
          count(*) filter (where archived_at is null and completed_at is null)::int as active,
          count(*) filter (where archived_at is null and completed_at is not null)::int as completed,
          count(*) filter (where archived_at is not null)::int as archived,
          avg(percentage) filter (where archived_at is null) as average
        from app.goals g where ${filters.join(" and ")}
      `, params.values);
      return { ...row, average: row.average === null ? null : Number(row.average) };
    });
  }

  defaults(actor: string, familyId: string) {
    return this.run(actor, familyId, async (client) => {
      const { rows: [row] } = await client.query<{ audience: NonNullable<GoalDto["audience"]> }>(
        "select app.default_family_item_audience('goals') as audience",
      );
      return { ...row, categories: [...goalCategories], priorities: [...goalPriorities], modes: [...goalModes] };
    });
  }

  get(actor: string, familyId: string, id: string) {
    return this.run(actor, familyId, (client, context) => this.detail(client, actor, familyId, id, context));
  }

  create(actor: string, familyId: string, input: CreateGoalInput) {
    return this.run(actor, familyId, async (client, context) => {
      const defaults = await client.query<{ audience: string }>("select app.default_family_item_audience('goals') as audience");
      const audience = input.audience ?? defaults.rows[0].audience;
      this.validateMode(input.mode, input);
      await client.query("select app.create_goal($1, $2, $3)", [familyId, input.id, { ...input, audience }]);
      return this.detail(client, actor, familyId, input.id, context);
    });
  }

  update(actor: string, familyId: string, id: string, input: UpdateGoalInput) {
    return this.run(actor, familyId, async (client, context) => {
      const existing = await this.detail(client, actor, familyId, id, context);
      this.validateMode(existing.mode, input);
      await client.query("select app.change_goal($1, $2, $3, 'details', $4)", [familyId, id, input.version, input]);
      return this.detail(client, actor, familyId, id, context);
    });
  }

  change(actor: string, familyId: string, id: string, action: string, data: { version: number; [key: string]: unknown }) {
    return this.run(actor, familyId, async (client, context) => {
      await client.query("select app.change_goal($1, $2, $3, $4, $5)", [familyId, id, data.version, action, data]);
      return this.detail(client, actor, familyId, id, context);
    });
  }

  linkTask(actor: string, familyId: string, id: string, input: LinkGoalTaskDto) {
    return this.run(actor, familyId, async (client, context) => {
      await client.query('select app.link_goal_task($1,$2,$3,$4,$5,$6)',
        [familyId, id, input.id, input.version, input.taskId, input.taskVersion]);
      return this.detail(client, actor, familyId, id, context);
    });
  }

  unlinkTask(actor: string, familyId: string, id: string, itemId: string, version: number) {
    return this.run(actor, familyId, async (client, context) => {
      const goal = await this.detail(client, actor, familyId, id, context);
      if (!goal.checklist.some((item) => item.id === itemId && item.task)) throw new NotFoundException('Task link not found.');
      await client.query("select app.change_goal($1,$2,$3,'delete_item',$4)", [familyId, id, version, { id: itemId }]);
      return this.detail(client, actor, familyId, id, context);
    });
  }

  linkableTasks(actor: string, familyId: string, id: string, query: LinkableTasksInput): Promise<LinkableTaskPageDto> {
    return this.run(actor, familyId, async (client, context) => {
      const goal = await this.detail(client, actor, familyId, id, context);
      if (!goal.canEdit) throw new ForbiddenException('Only the goal creator can link tasks.');
      if (goal.mode !== 'checklist' || goal.archived) throw new BadRequestException('Choose an unarchived checklist goal.');
      await generateOccurrences(client, familyId, context.today);
      const params = new Params();
      const filters = ['t.family_id = ' + params.add(familyId, 'uuid'), 'g.id = ' + params.add(id, 'uuid'),
        't.archived_at is null', 'app.goal_task_audiences_match(g,t)',
        'not exists (select 1 from app.goal_checklist_items i where i.goal_id = g.id and i.task_id = t.id)'];
      if (query.q) filters.push('position(lower(' + params.add(query.q, 'text') + ') in lower(t.title)) > 0');
      if (query.cursor) {
        const cursor = cursorSchema.safeParse(decodeCursor(query.cursor));
        if (!cursor.success || !Number.isFinite(Date.parse(cursor.data[2]))) throw new BadRequestException('The task page cursor is invalid.');
        filters.push('(t.created_at,t.id) > (' + params.add(cursor.data[2], 'timestamptz') + ',' + params.add(cursor.data[3], 'uuid') + ')');
      }
      const limit = query.limit ?? 20;
      const { rows } = await client.query<LinkableTaskDto & { created: string }>(`
        select t.id, t.title, t.status, t.version, t.due_date::text as "dueDate", t.created_at::text as created
        from app.tasks t cross join app.goals g where ${filters.join(' and ')} order by t.created_at,t.id limit ${limit + 1}
      `, params.values);
      const page = rows.slice(0, limit), last = page.at(-1);
      return { tasks: page.map(({ created, ...task }) => task),
        nextCursor: rows.length > limit && last ? encodeCursor(['', '', last.created, last.id]) : null };
    });
  }

  private filters(params: Params, familyId: string, actor: string, query: GoalListInput) {
    const conditions = ["g.family_id = " + params.add(familyId, "uuid")];
    if (query.type) conditions.push("g.goal_type = " + params.add(query.type, "text"));
    if (query.scope === "mine") {
      const user = params.add(actor, "uuid");
      conditions.push("(g.goal_type = 'family' or g.author_id = " + user + " or g.assignee_id = " + user + ")");
    }
    return conditions;
  }

  private validateMode(mode: GoalDto["mode"], input: { target?: number | null; unit?: string | null; checklist?: unknown[] }) {
    if (mode === "numeric" && (!input.target || !input.unit?.trim())) throw new BadRequestException("Enter a positive target and a unit.");
    if (mode !== "numeric" && (input.target != null || input.unit != null)) {
      throw new BadRequestException("Targets and units belong to numeric goals.");
    }
    if (mode !== "checklist" && input.checklist?.length) throw new BadRequestException("Checklist steps belong to checklist goals.");
  }

  private async detail(client: PoolClient, actor: string, familyId: string, id: string, context: GoalContext): Promise<GoalDetailDto> {
    const { rows: [row] } = await client.query<GoalRow>("select " + fields + " from app.goals g where g.family_id = $1 and g.id = $2", [familyId, id]);
    if (!row) throw new NotFoundException("Goal not found.");
    const { rows: checklist } = await client.query<GoalItemDto>(
      `select i.id, i.label, i.completed, case when t.id is not null then
        jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'archived',t.archived_at is not null) end as task
        from app.goal_checklist_items i left join app.tasks t on t.id = i.task_id
        where i.goal_id = $1 and (i.task_id is null or t.id is not null) order by i.created_at, i.id`, [id],
    );
    return { ...toGoal(row, actor, context), checklist };
  }
}
