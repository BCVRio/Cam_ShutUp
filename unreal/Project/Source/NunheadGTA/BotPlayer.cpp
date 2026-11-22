#include "BotPlayer.h"
#include "NunheadGTA.h"
#include "Football.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Animation/AnimSequence.h"
#include "Animation/BlendSpace.h"
#include "Animation/AnimSingleNodeInstance.h"
#include "AIController.h"
#include "EngineUtils.h"

ABotPlayer::ABotPlayer()
{
	PrimaryActorTick.bCanEverTick = true;
	GetCapsuleComponent()->InitCapsuleSize(30.f, 72.f);
	bUseControllerRotationYaw = false;
	GetCharacterMovement()->bOrientRotationToMovement = true; GetCharacterMovement()->RotationRate = FRotator(0, 540.f, 0); GetCharacterMovement()->MaxWalkSpeed = Speed;
	GetMesh()->SetRelativeLocation(FVector(0, 0, -72.f)); GetMesh()->SetRelativeRotation(FRotator(0, -90.f, 0));
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned; AIControllerClass = AAIController::StaticClass();
	Phase = FMath::FRand() * 6.28f;
}

void ABotPlayer::BeginPlay()
{
	Super::BeginPlay();
	HomeSpot = GetActorLocation();
	const FString& Path = BotRole == EBotRole::Keeper ? KeeperMeshPath : Team == ETeam::Home ? HomeMeshPath : AwayMeshPath;
	if (USkeletalMesh* SM = LoadObject<USkeletalMesh>(nullptr, *Path))
	{
		GetMesh()->SetSkeletalMesh(SM);
		const float MeshH = SM->GetBounds().BoxExtent.Z * 2.f; if (MeshH > 0.01f) GetMesh()->SetRelativeScale3D(FVector(140.f / MeshH));   // the glTF skeletal import lands at 1/100 scale
		GetMesh()->SetAnimationMode(EAnimationMode::AnimationSingleNode);
		// clips imported next to the mesh: <name>_Anim_idle / _Anim_run, and <name>_BS when the import made a blend space
		IdleAnim = LoadObject<UAnimSequence>(nullptr, *(Path + TEXT("_Anim_idle"))); RunAnim = LoadObject<UAnimSequence>(nullptr, *(Path + TEXT("_Anim_run")));
		if (!RunAnim) RunAnim = LoadObject<UAnimSequence>(nullptr, *(Path + TEXT("_Anim_walk")));
		MoveBlend = bUseBlendSpace ? LoadObject<UBlendSpace>(nullptr, *(Path + TEXT("_BS"))) : nullptr;
		if (MoveBlend) { GetMesh()->SetAnimation(MoveBlend); GetMesh()->Play(true); } else PlayClip(IdleAnim);
	}
	else UE_LOG(LogNunhead, Warning, TEXT("Bot mesh not found at %s"), *Path);
	for (TActorIterator<AFootball> It(GetWorld()); It; ++It) { Ball = *It; break; }
	for (TActorIterator<AGoal> It(GetWorld()); It; ++It) { if (It->DefendingTeam == Team) OwnGoal = *It; else TargetGoal = *It; }
}

void ABotPlayer::PlayClip(UAnimSequence* Clip) { if (!Clip || Clip == CurrentClip) return; CurrentClip = Clip; GetMesh()->PlayAnimation(Clip, true); }
void ABotPlayer::ReturnHome() { SetActorLocation(HomeSpot, false, nullptr, ETeleportType::TeleportPhysics); DiveT = 0.f; bDiving = false; }
void ABotPlayer::MoveToward(const FVector& Target, float SpeedScale)
{
	const FVector D = (Target - GetActorLocation()).GetSafeNormal2D();
	GetCharacterMovement()->MaxWalkSpeed = Speed * SpeedScale;
	AddMovementInput(D, 1.f);
}

void ABotPlayer::UpdateAnimation(float Dt)
{
	if (MoveBlend) { if (UAnimSingleNodeInstance* Node = GetMesh()->GetSingleNodeInstance()) Node->SetBlendSpacePosition(FVector(GetVelocity().Size2D(), 0, 0)); }
	else if (GetVelocity().Size2D() > 60.f) PlayClip(RunAnim); else PlayClip(IdleAnim);
	// a dive tips the whole body over for a moment, then he gets up
	if (DiveT > 0.f)
	{
		DiveT -= Dt;
		const float Roll = (DiveT > 0.3f ? 1.f : FMath::Max(0.f, DiveT / 0.3f)) * 75.f * DiveSide;
		GetMesh()->SetRelativeRotation(FRotator(0, -90.f, Roll));
		if (DiveT <= 0.f) { bDiving = false; GetMesh()->SetRelativeRotation(FRotator(0, -90.f, 0)); }
	}
}

void ABotPlayer::Tick(float Dt)
{
	Super::Tick(Dt);
	Cooldown -= Dt; DiveCooldown -= Dt; Phase += Dt;
	if (Ball) Think(Dt);
	UpdateAnimation(Dt);
}

void ABotPlayer::Keep(float Dt, const FVector& Me, const FVector& B, const FVector& AttackDir)
{
	// hold the line, slide across to the ball, dive at a shot that will beat him, clear it when it comes close
	const FVector GoalLoc = OwnGoal ? OwnGoal->GetActorLocation() : HomeSpot;
	const FVector Fwd = OwnGoal ? OwnGoal->GetActorForwardVector() : GetActorForwardVector();   // the goal faces the pitch
	const FVector Right = OwnGoal ? OwnGoal->GetActorRightVector() : FVector::RightVector;
	const FVector Line = GoalLoc + Fwd * 60.f;
	const float Side = FMath::Clamp(FVector::DotProduct(B - Line, Right), -200.f, 200.f);
	FVector Target = Line + Right * Side;
	const float DistToLine = FVector::Dist2D(B, Line);
	if (DistToLine < 450.f) Target = B;
	if (!bDiving) MoveToward(Target, 1.1f);
	// a shot coming in: where will it cross the line, and can he get there on his feet?
	const FVector BV = Ball->GetVelocity2D(); const float BallSpeed = BV.Size();
	const float Along = FVector::DotProduct(B - GoalLoc, Fwd), Closing = -FVector::DotProduct(BV, Fwd);
	if (OwnGoal && !bDiving && DiveCooldown <= 0.f && BallSpeed > 900.f && Closing > 400.f && Along > 80.f && Along < 1300.f)
	{
		const FVector Cross = B + BV * (Along / Closing);
		const float OnTarget = FVector::DotProduct(Cross - GoalLoc, Right), FromMe = FVector::DotProduct(Cross - Me, Right);
		if (FMath::Abs(OnTarget) < OwnGoal->Width * 0.5f + 60.f && FMath::Abs(FromMe) > 70.f && FMath::Abs(FromMe) < 420.f)
		{
			DiveSide = FMath::Sign(FromMe);
			LaunchCharacter(Right * DiveSide * DiveSpeed + FVector(0, 0, 230.f), true, true);
			bDiving = true; DiveT = 0.8f; DiveCooldown = 2.2f;
		}
	}
	const float Reach = bDiving ? 135.f : 90.f;
	const float DistToBall = FVector::Dist2D(Me, B);
	if (DistToBall < Reach && Cooldown <= 0.f && B.Z < Me.Z + 120.f) { Ball->Kick(AttackDir + FVector(FMath::FRandRange(-0.4f, 0.4f), FMath::FRandRange(-0.4f, 0.4f), 0), 750.f, 0.f, 0.25f, TEXT("keeper")); Cooldown = 1.5f; }
}

void ABotPlayer::Think(float Dt)
{
	const FVector Me = GetActorLocation(), B = Ball->GetActorLocation();
	const float DistToBall = FVector::Dist2D(Me, B);
	const FVector AttackDir = TargetGoal ? (TargetGoal->GetActorLocation() - B).GetSafeNormal2D() : GetActorForwardVector();
	if (BotRole == EBotRole::Keeper) { Keep(Dt, Me, B, AttackDir); return; }
	// nearest outfield team-mate chases; the rest take up a supporting position ahead of the ball
	ABotPlayer* Nearest = nullptr; float Best = 1e9f;
	for (TActorIterator<ABotPlayer> It(GetWorld()); It; ++It) { if (It->Team != Team || It->BotRole == EBotRole::Keeper) continue; const float D = FVector::Dist2D(It->GetActorLocation(), B); if (D < Best) { Best = D; Nearest = *It; } }
	if (Nearest == this)
	{
		MoveToward(B, 1.0f);
		if (DistToBall < 95.f && Cooldown <= 0.f)
		{
			const float ToGoal = TargetGoal ? FVector::Dist2D(B, TargetGoal->GetActorLocation()) : 9999.f;
			const bool bShoot = ToGoal < 1600.f && FMath::FRand() < 0.6f;
			const FVector Dir = (AttackDir + FVector(FMath::FRandRange(-0.25f, 0.25f), FMath::FRandRange(-0.25f, 0.25f), 0)).GetSafeNormal2D();
			Ball->Kick(Dir, bShoot ? 1900.f : 800.f, FMath::FRandRange(-0.3f, 0.3f), bShoot ? 0.2f : 0.05f, TEXT("bot"));
			Cooldown = bShoot ? 1.2f : 0.45f;
		}
	}
	else
	{
		const FVector Right = FVector::CrossProduct(FVector::UpVector, AttackDir);
		const float Lane = (GetUniqueID() % 2 ? 1.f : -1.f) * (500.f + 200.f * FMath::Sin(Phase * 0.7f));
		const FVector Support = B + AttackDir * 600.f + Right * Lane;
		if (FVector::Dist2D(Me, Support) > 120.f) MoveToward(Support, 0.8f);
	}
}
