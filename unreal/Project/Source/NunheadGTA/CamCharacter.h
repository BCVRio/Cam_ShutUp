#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "CamCharacter.generated.h"

class UInputAction; class UInputMappingContext; class USpringArmComponent; class UCameraComponent; class AFootball; class UAnimSequence; class UBlendSpace; class USoundBase;

// Cam: third-person, Enhanced Input (keyboard + Xbox pad). Hold the kick to charge a shot (A/D or the stick curls it),
// tap it to pass to the team-mate ahead, jump into the ball to head it, B calls the ball to his feet, running into it dribbles.
// Idle and run blend by speed through a 1D blend space when build_green.py has made one; otherwise the clips switch.
UCLASS(Config=Game)
class NUNHEADGTA_API ACamCharacter : public ACharacter
{
	GENERATED_BODY()
public:
	ACamCharacter();
	UPROPERTY(VisibleAnywhere) USpringArmComponent* Boom;
	UPROPERTY(VisibleAnywhere) UCameraComponent* Camera;
	// assets by path (DefaultGame.ini, filled by the Python import), all optional
	UPROPERTY(Config) FString CamMeshPath; UPROPERTY(Config) FString IdleAnimPath; UPROPERTY(Config) FString RunAnimPath; UPROPERTY(Config) FString JumpAnimPath; UPROPERTY(Config) FString MoveBlendPath;
	UPROPERTY(Config) FString ShutUpSoundPath; UPROPERTY(Config) FString HeaderSoundPath;
	UPROPERTY(EditAnywhere, Category="Cam") float WalkSpeed = 420.f;
	UPROPERTY(EditAnywhere, Category="Cam") float SprintSpeed = 820.f;
	UPROPERTY(EditAnywhere, Category="Cam") float KickReach = 150.f;
	UPROPERTY(EditAnywhere, Category="Cam") float PassTapTime = 0.18f;      // a kick released this quickly is a pass
	UPROPERTY(EditAnywhere, Category="Cam") float CallBallRange = 2500.f;
	UPROPERTY(EditAnywhere, Category="Cam") float CameraPullBack = 320.f;   // how far the camera backs off when the ball is far away
	UPROPERTY(BlueprintReadOnly, Category="Cam") float KickCharge = 0.f;
	UPROPERTY(BlueprintReadOnly, Category="Cam") int32 Goals = 0;
	UPROPERTY(BlueprintReadOnly, Category="Cam") FString LastTouch;         // pass / shot / header / call, for the HUD
	void OnGoal(bool bHomeScored);
protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void Landed(const FHitResult& Hit) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	void BuildInput();
	void Move(const struct FInputActionValue& V); void Look(const struct FInputActionValue& V);
	void SprintOn(); void SprintOff(); void KickStart(); void KickRelease(); void DoJump(); void CallBall();
	bool TryPass(AFootball* Ball, const FVector& Fwd);
	void TryHeader();
	void UpdateAnimation(float Dt);
	void UpdateCamera(float Dt);
	AFootball* NearestBall(float MaxDist) const;
	void PlayClip(UAnimSequence* Clip, bool bLoop);
	void BackToMoveBlend();
	UPROPERTY() UInputMappingContext* Mapping = nullptr;
	UPROPERTY() UInputAction* MoveAction = nullptr; UPROPERTY() UInputAction* LookAction = nullptr; UPROPERTY() UInputAction* JumpAction = nullptr; UPROPERTY() UInputAction* SprintAction = nullptr; UPROPERTY() UInputAction* KickAction = nullptr; UPROPERTY() UInputAction* CallAction = nullptr;
	UPROPERTY() UAnimSequence* IdleAnim = nullptr; UPROPERTY() UAnimSequence* RunAnim = nullptr; UPROPERTY() UAnimSequence* JumpAnim = nullptr; UPROPERTY() UAnimSequence* CurrentClip = nullptr;
	UPROPERTY() UBlendSpace* MoveBlend = nullptr;
	UPROPERTY() USoundBase* ShutUpSound = nullptr; UPROPERTY() USoundBase* HeaderSound = nullptr;
	FVector2D MoveInput = FVector2D::ZeroVector;
	bool bCharging = false; float ChargeHeld = 0.f; float DribbleCooldown = 0.f; float JumpClipHold = 0.f; bool bHeaderDone = false; float BaseArm = 420.f;
};
