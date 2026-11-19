import {
  BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Req, UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import {
  acceptInput, AcceptInvitationDto, familyInput, FamilyDto, FamilyInputDto, FamilyMemberDto, InvitationDto, inviteInput, InviteInputDto,
} from "./family.dto.js";
import { FamilyService } from "./family.service.js";

function parseFamilyInput(input: FamilyInputDto) {
  const result = familyInput.safeParse(input);
  if (!result.success) throw new BadRequestException("Enter a family name up to 100 characters and a valid time zone.");
  return result.data;
}

@Controller("api/v1")
@UseGuards(AuthGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "The session is missing or invalid." })
export class FamilyController {
  constructor(private readonly families: FamilyService) {}

  @Get("families")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "listFamilies" })
  @ApiOkResponse({ type: [FamilyDto] })
  list(@Req() { actorId }: AuthenticatedRequest) {
    return this.families.list(actorId);
  }

  @Post("families")
  @ApiOperation({ operationId: "createFamily" })
  @ApiCreatedResponse({ type: FamilyDto })
  create(@Req() { actorId }: AuthenticatedRequest, @Body() input: FamilyInputDto) {
    return this.families.create(actorId, parseFamilyInput(input));
  }

  @Get("families/:familyId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getFamily" })
  @ApiOkResponse({ type: FamilyDto })
  get(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.families.get(actorId, familyId);
  }

  @Put("families/:familyId/settings")
  @ApiOperation({ operationId: "updateFamilySettings" })
  @ApiOkResponse({ type: FamilyDto })
  updateSettings(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Body() input: FamilyInputDto,
  ) {
    return this.families.updateSettings(actorId, familyId, parseFamilyInput(input));
  }

  @Get("families/:familyId/members")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "listFamilyMembers" })
  @ApiOkResponse({ type: [FamilyMemberDto] })
  members(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.families.listMembers(actorId, familyId);
  }

  @Delete("families/:familyId/members/:memberId")
  @HttpCode(204)
  @ApiOperation({ operationId: "removeFamilyMember" })
  @ApiNoContentResponse()
  removeMember(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("memberId", ParseUUIDPipe) memberId: string,
  ) {
    return this.families.removeMember(actorId, familyId, memberId);
  }

  @Post("families/:familyId/members/:memberId/transfer-ownership")
  @HttpCode(200)
  @ApiOperation({ operationId: "transferFamilyOwnership" })
  @ApiOkResponse({ type: FamilyDto })
  transferOwnership(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("memberId", ParseUUIDPipe) memberId: string,
  ) {
    return this.families.transferOwnership(actorId, familyId, memberId);
  }

  @Get("families/:familyId/invitations")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "listFamilyInvitations" })
  @ApiOkResponse({ type: [InvitationDto] })
  listInvitations(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.families.listInvitations(actorId, familyId);
  }

  @Post("families/:familyId/invitations")
  @ApiOperation({ operationId: "inviteFamilyMember" })
  @ApiCreatedResponse({ type: InvitationDto })
  invite(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Body() input: InviteInputDto,
  ) {
    const result = inviteInput.safeParse(input);
    if (!result.success) throw new BadRequestException("Enter a valid email address.");
    return this.families.invite(actorId, familyId, result.data.email);
  }

  @Post("families/:familyId/invitations/:invitationId/resend")
  @HttpCode(200)
  @ApiOperation({ operationId: "resendFamilyInvitation" })
  @ApiOkResponse({ type: InvitationDto })
  resend(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("invitationId", ParseUUIDPipe) invitationId: string,
  ) {
    return this.families.resend(actorId, familyId, invitationId);
  }

  @Delete("families/:familyId/invitations/:invitationId")
  @ApiOperation({ operationId: "revokeFamilyInvitation" })
  @ApiOkResponse({ type: InvitationDto })
  revoke(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("invitationId", ParseUUIDPipe) invitationId: string,
  ) {
    return this.families.revoke(actorId, familyId, invitationId);
  }

  @Post("invitations/accept")
  @HttpCode(200)
  @ApiOperation({ operationId: "acceptFamilyInvitation" })
  @ApiOkResponse({ type: FamilyDto })
  accept(@Req() { actorId }: AuthenticatedRequest, @Body() input: AcceptInvitationDto) {
    const result = acceptInput.safeParse(input);
    if (!result.success) throw new NotFoundException("This invitation is unavailable for your account.");
    return this.families.accept(actorId, result.data.token);
  }
}
